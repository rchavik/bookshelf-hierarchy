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

  let onCreating = function(model, attrs, options) {
    var self = this;
    return bookshelf.transaction(transaction => {
      return _onCreating.call(self, transaction, model, attrs, options)
    });
  };

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
  modelPrototype.on('fetching', onFetching);
  modelPrototype.on('fetching:collection', onFetching);

  bookshelf.Model = bookshelf.Model.extend({

    constructor: function() {

      modelPrototype.constructor.apply(this, arguments)

    },

    removeFromTree: removeFromTree,
  })

}
