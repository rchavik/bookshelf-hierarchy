require('babel-register');

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
    new Category().removeFromTree({id: 8}, {transacting: t}).then(res => {
      t.commit();
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
  console.log(results.toJSON());
}).catch(err => {
  console.log(err);
});
