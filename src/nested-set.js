'use strict';

import merge from 'lodash/merge';

module.exports = function nestedSetPlugin(bookshelf) {

  let config = {
    fields: {
      left: 'lft',
      right: 'rgt',
      parentId: 'parent_id',
    }
  };

  let fieldLeft;
  let fieldRight;
  let fieldParent;

  let prototype = bookshelf.Model.prototype;

  let moveLeft = function(node, newParent, options) {
    let left = node.get(fieldLeft)
    let right = node.get(fieldRight)
    let parentRight = newParent && newParent.get(fieldRight) || 1;
    let tx = options && options.transacting ? options.transacting : null;

    return this.constructor.query().transacting(tx).update({

      [fieldLeft]: bookshelf.knex.raw([
        fieldLeft, '+ case',
          'when', fieldLeft, 'between', left, 'and', right, 'then',
            (parentRight - left),
          'when', fieldLeft, 'between', parentRight, 'and', (left -1), 'then',
            (right - left + 1),
          'else 0 end',
        ].join(' ')),

      [fieldRight]: bookshelf.knex.raw([
        fieldRight, '+ case',
          'when', fieldRight, 'between', left, 'and', right, 'then',
            (parentRight - left),
          'when', fieldRight, 'between', parentRight, 'and', (left - 1), 'then',
            (right - left + 1),
          'else 0 end',
        ].join(' ')),

      })
      .whereBetween(fieldLeft, [parentRight, right])
      .orWhereBetween(fieldRight, [parentRight, right]);
  }

  let moveRight = function(node, newParent, options) {
    let left = node.get(fieldLeft)
    let right = node.get(fieldRight)
    let parentRight = newParent && newParent.get(fieldRight) || 1;
    let tx = options && options.transacting ? options.transacting : null;

    return this.constructor.query().transacting(tx).update({

      [fieldLeft]: bookshelf.knex.raw([
        fieldLeft, '+ case',
          'when', fieldLeft, 'between', left, 'and', right, 'then',
            (parentRight - right - 1),
          'when', fieldLeft, 'between', (right + 1), 'and', (parentRight - 1), 'then',
            (left - right - 1),
          'else 0 end',
        ].join(' ')),

      [fieldRight]: bookshelf.knex.raw([
        fieldRight, '+ case',
          'when', fieldRight, 'between', left, 'and', right, 'then',
            (parentRight - right - 1),
          'when', fieldRight, 'between', (right + 1), 'and', (parentRight - 1), 'then',
            (left - right - 1),
          'else 0 end',
        ].join(' ')),

      })
      .whereBetween(fieldLeft, [left, parentRight])
      .orWhereBetween(fieldRight, [left, parentRight]);
  }

  // http://falsinsoft.blogspot.com/2013/01/tree-in-sql-database-nested-set-model.html
  // https://groups.google.com/d/msg/microsoft.public.sqlserver.programming/IOZAEPlWIB8/qQOckfuP-4MJ
  let setParent = async function(nodeId, newParentId, options) {
    if (!this.nestedSet) {
      throw new Error('Model does not have NestedSetModel configuration');
    }

    let condParent = newParentId ? {[prototype.idAttribute]: newParentId} : {};

    let newParent = await this.constructor.forge(applyScope(condParent)
    ).fetch(options).catch(err => { throw err});

    if (newParentId && !newParent) {
      throw new Error('Invalid parent');
    }

    let node = await this.constructor.forge(
      applyScope({
        [prototype.idAttribute]: nodeId,
      })
    ).fetch(options).catch(err => { throw err });

    if (!node) {
      throw new Error('Invalid node');
    }

    const newParentRight = newParent && newParent.get(fieldRight) || 0;
    const originLeft = node.get(fieldLeft);
    const originRight = node.get(fieldRight);

    await node.save(applyScope({parent_id: newParentId}),
      {transacting: options.transacting, patch: true}
    );

    if (newParentRight < originLeft) {
      return moveLeft.bind(this)(node, newParent, options);
    } else if (newParentRight > originRight) {
      return moveRight.bind(this)(node, newParent, options);
    } else {
      throw new Error('Cannot move a subtree to itself');
    }

  }

  let onCreating = function(model, attrs, options) {
    var self = this;
    let transaction = options.transacting;
    if (transaction) {
      return _onCreating.call(self, transaction, model, attrs, options)
    } else {
      return bookshelf.transaction(transaction => {
        return _onCreating.call(self, transaction, model, attrs, options)
      });
    }
  };

  let _onCreating = function(transaction, model, attrs, options) {

    if (model.changed[fieldParent]) {

      return this.constructor.forge(applyScope({
          [prototype.idAttribute]: model.changed[fieldParent]
        }))
        .fetch({
          transacting: transaction
        })
        .then(parent => {
          if (parent) {
            let edge = parent.get(fieldRight);

            let updateRight = applyScope(this.constructor.forge()
              .where(fieldRight, '>=', edge))
              .save({
                [fieldRight]: bookshelf.knex.raw(fieldRight + ' + 2')
              }, {
                method: 'update',
                require: false,
                transacting: transaction,
              }).catch(e => {
                throw e;
              });

            let updateLeft = applyScope(this.constructor.forge()
              .where(fieldLeft, '>', edge))
              .save({
                [fieldLeft]: bookshelf.knex.raw(fieldLeft + ' + 2')
              }, {
                method: 'update',
                require: false,
                transacting: transaction,
              }).catch(e => {
                throw e;
              });

            return Promise.all([updateRight, updateLeft]).then(q => {
                attrs[fieldLeft] = edge;
                attrs[fieldRight] = edge + 1;
                applyScope(attrs);
                this.set(attrs);
            });
          } else {
            throw new Error('Parent not found');
          }
        });

    } else {

      // new root node
      return this.query(qb => {
        applyScope(qb)
          .orderBy(fieldRight, 'desc')
          .limit(1);
        })
        .fetch({
          transacting: transaction,
        })
        .then(parent => {
          if (parent) {
            attrs[fieldLeft] = parent[fieldRight] + 1;
            attrs[fieldRight] = parent[fieldRight] + 2;
            applyScope(attrs)
            this.set(attrs);
          } else {

            let query = applyScope(this.constructor.forge()
              .orderBy(fieldRight, 'desc'))
              .fetch({transacting: transaction});

            return query.asCallback((err, edge) => {
              if (edge) {
                attrs[fieldLeft] = edge.get(fieldRight) + 1;
                attrs[fieldRight] = edge.get(fieldRight) + 2;
              } else {
                attrs[fieldLeft] = 1;
                attrs[fieldRight] = 2;
              }

              applyScope(attrs)
              this.set(attrs);
              return this;
            });
          }
        });
    }
  };

  let removeFromTree = function(model, options) {
    if (!this.nestedSet) {
      throw new Error('Model does not have NestedSetModel configuration');
    }

    let transaction = options ? options.transacting : null;

    if (! model[prototype.idAttribute]) {
      return;
    }

    let fetchNode = this.constructor.forge({
      [prototype.idAttribute]: model[prototype.idAttribute],
    })
    .fetch({
      transacting: transaction
    })
    .then(node => {
      if (!node) {
        throw new Error('Invalid node id:', model[prototype.idAttribute]);
      }

      let myLeft = parseInt(node.get(fieldLeft), 10);
      let myRight = parseInt(node.get(fieldRight), 10);
      let myWidth = myRight - myLeft + 1;

      // if (myRight - myLeft == 1) { return; }

      let updateRight = this.constructor.forge()
        .where(fieldRight, '>', myRight)
        .save({
          [fieldRight]: bookshelf.knex.raw(fieldRight + ' - ' + myWidth)
        }, {
          method: 'update',
          require: false,
          transacting: transaction,
        }).catch(e => {
          throw e;
        });

      let updateLeft = this.constructor.forge()
        .where(fieldLeft, '>', myRight)
        .save({
          [fieldLeft]: bookshelf.knex.raw(fieldLeft + ' - ' + myWidth)
        }, {
          method: 'update',
          require: false,
          transacting: transaction,
        }).catch(e => {
          throw e;
        });


      let deletePromise = this.query(qb => {
          qb.whereRaw([fieldLeft, 'between', myLeft, 'and', myRight,].join(' '))
        })
        .destroy({
          transacting: transaction,
        }).catch(e => {
          throw e;
        });

      return Promise.all([deletePromise, updateRight, updateLeft]);
    });

    return Promise.resolve(fetchNode)
  };

  let onFetching = function(model, columns, options) {
    var self = this;
    if (options.findChildren) {
      return onFindChildren.call(self, model, columns, options);
    }

    if (options.findPath) {
      return onFindPath.call(self, model, columns, options);
    }
  }

  let onFindChildren = function(model, columns, options) {

    if (! options.findChildren.for) {
      throw new Error('The \'for\' key is required for \'findChildren\'');
    }

    options.query.orderBy(fieldLeft, 'asc');

    if (options.findChildren.direct) {
      return options.query.where(fieldParent, '=', options.findChildren.for)
    }

    return this.constructor.forge({
      [prototype.idAttribute]: options.findChildren.for,
    }).fetch({
      transacting: options.transacting,
    }).then(node => {
      options.query
        .andWhere(fieldRight, '<', node.get(fieldRight))
        .andWhere(fieldLeft, '>', node.get(fieldLeft))
    });

  }

  let onFindPath = function(model, columns, options) {

    if (! options.findPath.for) {
      throw new Error('The \'for\' key is required for \'findPath\'');
    }

    return this.constructor.forge({
      [prototype.idAttribute]: options.findPath.for,
    }).fetch({
      transacting: options.transacting,
    }).then(node => {

      if (!node) {
        throw new Error('Cannot find with node id ' + options.findPath.for);
      }

      options.query
        .andWhere(fieldLeft, '<=', node.get(fieldLeft))
        .andWhere(fieldRight, '>=', node.get(fieldRight))
        .orderBy(fieldLeft, 'asc');
    });
  }

  let setScope = function(scope) {
    if (!scope) {
      throw new Error('Invalid scope');
    }
    this._treeScope = scope;
    return this;
  }

  let applyScope = function(data) {
    if (!this._treeScope) {
      return data;
    }

    if (data && typeof data.where === 'function') {
      return data.where(this._treeScope);
    }

    let fields = Object.getOwnPropertyNames(this._treeScope)
    fields.forEach(fieldName => {
      data[fieldName] = this._treeScope[fieldName]
    })
    return data;
  }

  let moveUp = async function(nodeId, number = 1, options) {
    let node = await applyScope(this.constructor.forge({id: nodeId}))
      .fetch({transacting: options.transacting})
      .catch(err => console.log(err))

    let nodeParent = node && node.get(fieldParent)
    let nodeLeft = node && node.get(fieldLeft)
    let nodeRight = node && node.get(fieldRight)

    let targetNode = null
    let transaction = options.transacting || null

    let targetNodePromise = await applyScope(this.constructor.forge())
      .where({[fieldParent]: nodeParent})
      .where(fieldRight, '<', nodeLeft)
      .orderBy(fieldLeft, 'desc')
      .fetchPage({
        offset: number - 1,
        limit: 1,
      }, {
        transacting: transaction
      });

    let fallbackPromise = applyScope(this.constructor.forge())
      .where({[fieldParent]: nodeParent})
      .where(fieldRight, '<', nodeLeft)
      .orderBy(fieldLeft, 'asc');

    if (targetNodePromise.length > 0) {
      targetNode = targetNodePromise.at(0);
    } else {
      fallbackPromise = await fallbackPromise
        .fetchPage({
          limit: 1,
        }, {
          transacting: transaction
        });
      if (fallbackPromise.length === 0) {
        throw new Error('Invalid target node')
      }
      targetNode = fallbackPromise.at(0)
    }

    let targetLeft = targetNode.get(fieldLeft)
    let edge = await this._getMax()

    let leftBoundary = targetLeft;
    let rightBoundary = nodeLeft + 1;

    let nodeToEdge = edge - nodeLeft + 1;
    let shift = nodeRight - nodeLeft + 1;
    let nodeToHole = edge - leftBoundary + 1;

    await this._sync(transaction, nodeToEdge, '+', 'between ' + nodeLeft + ' AND ' + nodeRight);
    await this._sync(transaction, shift, '+', 'between ' + leftBoundary + ' AND ' + rightBoundary);
    await this._sync(transaction, nodeToHole, '-', '> ' + edge);

    return await node.save({
      [fieldLeft]: targetLeft,
      [fieldRight]: targetLeft + (nodeRight - nodeLeft)
    }, {
      transacting: transaction,
      patch: true
    }).catch(err => {
      throw (err);
    })
  }

  let moveDown = async function(nodeId, number = 1, options) {
    let node = await applyScope(this.constructor.forge({id: nodeId}))
      .fetch({transacting: options.transacting})
      .catch(err => console.log(err))

    let nodeParent = node && node.get(fieldParent)
    let nodeLeft = node && node.get(fieldLeft)
    let nodeRight = node && node.get(fieldRight)

    let targetNode = null
    let transaction = options.transacting || null

    let targetNodePromise = await applyScope(this.constructor.forge())
      .where({[fieldParent]: nodeParent})
      .where(fieldLeft, '>', nodeRight)
      .orderBy(fieldLeft, 'asc')
      .fetchPage({
        offset: number - 1,
        limit: 1,
      }, {
        transacting: transaction
      });

    let fallbackPromise = applyScope(this.constructor.forge())
      .where({[fieldParent]: nodeParent})
      .where(fieldLeft, '>', nodeRight)
      .orderBy(fieldLeft, 'desc');

    if (targetNodePromise.length > 0) {
      targetNode = targetNodePromise.at(0);
    } else {
      fallbackPromise = await fallbackPromise
        .fetchPage({
          limit: 1,
        }, {
          transacting: transaction
        });
      if (fallbackPromise.length === 0) {
        throw new Error('Invalid target node')
      }
      targetNode = fallbackPromise.at(0)
    }

    let targetRight = targetNode.get(fieldRight)
    let edge = await this._getMax()

    let leftBoundary = nodeRight + 1;
    let rightBoundary = targetRight;

    let nodeToEdge = edge - nodeLeft + 1;
    let shift = nodeRight - nodeLeft + 1;
    let nodeToHole = edge - rightBoundary + shift;

    await this._sync(transaction, nodeToEdge, '+', 'between ' + nodeLeft + ' AND ' + nodeRight);
    await this._sync(transaction, shift, '-', 'between ' + leftBoundary + ' AND ' + rightBoundary);
    await this._sync(transaction, nodeToHole, '-', '> ' + edge);

    return await node.save({
      [fieldLeft]: targetRight - (nodeRight - nodeLeft),
      [fieldRight]: targetRight,
    }, {
      transacting: transaction,
      patch: true
    }).catch(err => {
      throw (err);
    })
  }

  let _getMax = async function(transaction) {
    let node = await applyScope(this.constructor.forge())
      .orderBy(fieldRight, 'desc')
      .fetch({transacting: transaction})

    if (!node.get(fieldRight)) {
      return 0;
    }

    return node.get(fieldRight);
  }

  let _sync = async function(transaction, shift, dir, conditions, mark = false) {

    let fields = [fieldLeft, fieldRight]
    for (var i in fields) {
      let field = fields[i]
      mark = mark ? '*-1' : '';
      let template = {
        [field]: bookshelf.knex.raw(
          '(' + field + ' ' + dir + ' ' + shift + ')' + mark
        ),
      }

      await applyScope(this.constructor.query()
        .whereRaw(field + ' ' + conditions)
        .update(template, {
          transacting: transaction
        }))
        .catch(err => {
          console.log(err)
        });
    }
  }

  bookshelf.Model = bookshelf.Model.extend({

    constructor: function() {

      this._treeScope = null;
      if (arguments['1'] && arguments['1'].scope) {
        setScope.call(this, arguments['1'].scope)
      }

      prototype.constructor.apply(this, arguments)

      if (!this.nestedSet) {
        return;
      }

      config = merge(config, this.nestedSet);
      let fields = config.fields;

      if (!fields.left || !fields.right || !fields.parentId) {
        throw new Error('Missing/invalid nested set configuration');
      }

      fieldLeft = config.fields.left;
      fieldRight = config.fields.right;
      fieldParent = config.fields.parentId;

      this.on('creating', onCreating);
      this.on('fetching', onFetching);
      this.on('fetching:collection', onFetching);

      applyScope = applyScope.bind(this);
      setScope = setScope.bind(this);
      this._getMax = _getMax.bind(this);
      this._sync = _sync.bind(this);
    },

    removeFromTree: removeFromTree,
    setParent: setParent,
    setScope: setScope,
    moveUp: moveUp,
    moveDown: moveDown,

  })

}
