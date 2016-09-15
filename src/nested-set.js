module.exports = function nestedSetPlugin(bookshelf) {

  // FIXME: This should be configurable
  let config = {
    fields: {
      left: 'lft',
      right: 'rgt',
    }
  };

  const fieldLeft = config.fields.left;
  const fieldRight = config.fields.right;

  let modelPrototype = bookshelf.Model.prototype;

  let onCreating = function(model, attrs, options) {

    if (attrs.parent_id) {

      return this.constructor.forge({
          [modelPrototype.idAttribute]: attrs.parent_id
        })
        .fetch()
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
        .fetch()
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

    if (! model[modelPrototype.idAttribute]) {
      return;
    }

    let fetchNode = this.constructor.forge({
      [modelPrototype.idAttribute]: model[modelPrototype.idAttribute],
    })
    .fetch()
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
        })
        .then(q => {
          //console.log('q', q);
        }).catch(e => {
          console.log(e)
        });


      let deletePromise = this.query(qb => {
          qb.whereRaw([fieldLeft, 'between', myLeft, 'and', myRight,].join(' '))
        })
        .destroy()
        .then(() => {
        }).catch(e => {
          console.log('ERROR', e);
        });

      return Promise.all([deletePromise, updateRight, updateLeft]);
    });

    return Promise.resolve(fetchNode)
  };

  bookshelf.Model = bookshelf.Model.extend({

    constructor: function() {

      modelPrototype.constructor.apply(this, arguments)

      modelPrototype.on('creating', onCreating.bind(this));
    },

    removeFromTree: removeFromTree,
  })

}
