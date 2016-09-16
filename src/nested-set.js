module.exports = function nestedSetPlugin(bookshelf) {

  // FIXME: This should be configurable
  let config = {
    fields: {
      left: 'lft',
      right: 'rgt',
      parentId: 'parent_id',
    }
  };

  const fieldLeft = config.fields.left;
  const fieldRight = config.fields.right;
  const fieldParent = config.fields.parentId;

  let modelPrototype = bookshelf.Model.prototype;

  let setParent = async function(model, attrs, options) {
    let sync = _sync.bind(this)
    let unmarkInternalTree = _unmarkInternalTree.bind(this)
    let parentId = model.changed[fieldParent];
    let parent = await this.constructor.forge({id: parentId}).fetch();

    let parentLeft = parent.get(fieldLeft);
    let parentRight = parent.get(fieldRight);
    let left = model.get(fieldLeft)
    let right = model.get(fieldRight)

    if (parentLeft > left && parentLeft < right) {
      throw new Error(
        'Cannot use node ' + parentId + ' for entity ' +
        model.get(modelPrototype.idAttribute)
      );
    }

    // values for moving to the left
    let diff = right - left + 1;
    let targetLeft = parentRight;
    let targetRight = diff + parentRight - 1;
    let min = parentRight;
    let max = left - 1;

    if (left < targetLeft) {
      // moving to the right
      targetLeft = parentRight - diff
      targetRight = parentRight - 1
      min = right + 1
      max = parentRight - 1
      diff *= -1;
    }

    let internalLeft, internalRight
    if (right - left > 1) {
      // correcting internal subtree
      internalLeft = left + 1
      internalRight = right + 1
      await sync(targetLeft - left, '+', 'between ' + internalLeft + ' and ' + internalRight, true);
    }

    await sync(diff, '+', 'between ' + min + ' and ' + max);

    if (right - left > 1) {
      await unmarkInternalTree()
    }

    model
      .set(fieldLeft, targetLeft)
      .set(fieldRight, targetRight)
      .save()
      .then(res => {
        //console.log('res', res)
      })

  }

  let onSaving = async function(model, attrs, options) {
    try {
      if (options.method == 'update' && model.changed[fieldParent]) {
        return await setParent.call(this, model, attrs, options);
      }
    } catch (e) {
      console.log(e);
    }
  }

  let onCreating = function(model, attrs, options) {
    var self = this;
    return bookshelf.transaction(transaction => {
      return _onCreating.call(self, transaction, model, attrs, options)
    });
  };

  let _unmarkInternalTree = async function() {
    let q = this.constructor.query()
    await q
      .update({
        [fieldLeft]: bookshelf.knex.raw(fieldLeft + ' * -1'),
        [fieldRight]: bookshelf.knex.raw(fieldLeft + ' * -1'),
      })
      .where(fieldLeft, '<', 0)
  }

  let _sync = async function(shift, dir, conditions, mark = false) {

    let fields = [fieldLeft, fieldRight]
    for (var i in fields) {
      let field = fields[i]
      mark = mark ? '*-1' : '';
      let template = {
        [field]: bookshelf.knex.raw(
          '(' + field + ' ' + dir + ' ' + shift + ')' + mark
        ),
      }

      await this.constructor.query()
        .whereRaw(field + ' ' + conditions)
        .update(template)
        .then(res => {
          //console.log(res);
        })
        .catch(err => {
          console.log(err)
        });
    }
  }

  let _onCreating = function(transaction, model, attrs, options) {

    if (attrs[fieldParent]) {

      return this.constructor.forge({
          [modelPrototype.idAttribute]: attrs[fieldParent]
        })
        .fetch({
          transacting: transaction
        })
        .then(parent => {
          if (parent) {
            let edge = parent.get(fieldRight);

            let updateRight = this.constructor.forge()
              .where(fieldRight, '>=', edge)
              .save({
                [fieldRight]: bookshelf.knex.raw(fieldRight + ' + 2')
              }, {
                method: 'update',
                require: false,
                transacting: transaction,
              })
              .then(q => {
                //console.log('q', q);
              }).catch(e => {
                console.log(e)
              });

            let updateLeft = this.constructor.forge()
              .where(fieldLeft, '>', edge)
              .save({
                [fieldLeft]: bookshelf.knex.raw(fieldLeft + ' + 2')
              }, {
                method: 'update',
                require: false,
                transacting: transaction,
              })
              .then(q => {
                //console.log('q', q);
              }).catch(e => {
                console.log(e)
              });

            return Promise.all([updateRight, updateLeft]).then(q => {
                attrs[fieldLeft] = edge;
                attrs[fieldRight] = edge + 1;
                this.set(attrs);
            });
          } else {
            throw new Error('Parent not found');
          }
        });

    } else {

      // new root node
      return this.query(qb => {
        qb
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
          } else {
            attrs[fieldLeft] = 1;
            attrs[fieldRight] = 2;
          }
          this.set(attrs);
        });
    }
  };

  let removeFromTree = function(model, options) {
    let transaction = options ? options.transacting : null;

    if (! model[modelPrototype.idAttribute]) {
      return;
    }

    let fetchNode = this.constructor.forge({
      [modelPrototype.idAttribute]: model[modelPrototype.idAttribute],
    })
    .fetch({
      transacting: transaction
    })
    .then(node => {
      if (!node) {
        throw new Error('Invalid node id:', model[modelPrototype.idAttribute]);
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
        })
        .then(q => {
          //console.log('q', q);
        })
        .catch(e => {
          console.log(e)
        });

      let updateLeft = this.constructor.forge()
        .where(fieldLeft, '>', myRight)
        .save({
          [fieldLeft]: bookshelf.knex.raw(fieldLeft + ' - ' + myWidth)
        }, {
          method: 'update',
          require: false,
          transacting: transaction,
        })
        .then(q => {
          //console.log('q', q);
        }).catch(e => {
          console.log(e)
        });


      let deletePromise = this.query(qb => {
          qb.whereRaw([fieldLeft, 'between', myLeft, 'and', myRight,].join(' '))
        })
        .destroy({
          transacting: transaction,
        })
        .then(() => {
        }).catch(e => {
          console.log('ERROR', e);
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
      [modelPrototype.idAttribute]: options.findChildren.for,
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
      [modelPrototype.idAttribute]: options.findPath.for,
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

  modelPrototype.on('creating', onCreating);
  modelPrototype.on('saving', onSaving);
  modelPrototype.on('fetching', onFetching);
  modelPrototype.on('fetching:collection', onFetching);

  bookshelf.Model = bookshelf.Model.extend({

    constructor: function() {

      modelPrototype.constructor.apply(this, arguments)

    },

    removeFromTree: removeFromTree,
  })

}
