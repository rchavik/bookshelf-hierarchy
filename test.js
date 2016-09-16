require('babel-register');
require('babel-polyfill');

var config = require('./knexfile');
var knex = require('knex');
var bookshelf= require('bookshelf');
var bookshelfTree = require('./src');
var ORM = bookshelf(knex(config.development));

ORM.plugin(bookshelfTree.NestedSetModel);

var Category = ORM.Model.extend({
  tableName: 'nested_category',
});

ORM.transaction(t => {
  new Category().save({name: '3D TV', parent_id: 2}, {transacting: t})
  .then(category => {

    Category.forge().fetchAll({
      findPath: {
        for: category.get('id'),
      },
      transacting: t,
    })
    .then(results => {
      console.log('Results for findPath(' + category.get('id') + '):\n', results.toJSON(), '\n');

      new Category().removeFromTree({id: 8}, {transacting: t}).then(res => {
        t.commit();
      });

    }).catch(err => {
      console.log(err);
    });

  });
}).then(() => {
  console.log('transaction commited');
}).catch(() => {
  console.log('transaction error');
});

Category.forge().fetchAll({
  findChildren: {
    for: 6,
    direct: false,
  }
})
.then(results => {
  console.log('Results for findChildren(6):\n', results.toJSON(), '\n');
}).catch(err => {
  console.log(err);
});

// move FLASH under PORTABLE ELECTRONICS
var Model = new Category({id: 8});
Model.fetch().then(node => {
  node.set('parent_id', 6);
  node.save();
});
