require('babel-register');
require('babel-polyfill');

var async = require('async');
var config = require('./knexfile');
var knex = require('knex');
var bookshelf= require('bookshelf');
var bookshelfTree = require('./dist');
var ORM = bookshelf(knex(config.development));

ORM.plugin(bookshelfTree.NestedSetModel);

var Category = ORM.Model.extend({
  tableName: 'nested_category',
  nestedSet: true,
});

async.series([

  function(done) {
    ORM.transaction(t => {
      let model = new Category();
      model.save({name: '3D TV', parent_id: 2}, {transacting: t})
      .then(category => {
        Category.forge().fetchAll({
          findPath: {
            for: category.get('id'),
          },
          transacting: t,
        })
        .then(results => {
          console.log('Results for findPath(' + category.get('id') + '):')
          console.log(results.toJSON(), '\n');
          new Category().removeFromTree({id: 8}, {transacting: t}).then(res => {
            t.commit();
          });
        });
      });
    }).then(() => {
      console.log('Added 3D TV and removed FLASH');
      done();
    });
  },

  function(done) {
    Category.forge().fetchAll({
      findChildren: {
        for: 6,
        direct: false,
      }
    })
    .then(results => {
      console.log('Results for findChildren(6):\n', results.toJSON(), '\n');
      done()
    });
  },

  function(done) {
    ORM.transaction(t => {
      new Category().setParent(2, 6, {transacting: t}).then(res => {
        t.commit();
      });
    }).then(() => {
      console.log('Moved TELEVISIONS (2) under PORTABLE ELECTRONICS (6)');
      done()
    });
  },

  function(done) {
    ORM.transaction(t => {
      new Category().save({name: 'COMPUTER'}, {transacting: t})
        .then(res => {
          new Category().save({name: 'PC', parent_id: res.get('id')}, {transacting: t}).then(res2 => {
            t.commit();
          })
        });
    }).then(() => {
      console.log('Added a new root node: COMPUTER with one child: PC');
      done();
    });
  },

  function(done) {
    ORM.transaction(t => {
      new Category().setParent(12, 1, {transacting: t}).then(res => {
        t.commit();
      });
    }).then(() => {
      console.log('Moved COMPUTER (12) under ELECTRONICS (1)');
      done();
    });
  },

  function(done) {
    ORM.transaction(t => {
      new Category().setParent(12, null, {transacting: t}).then(res => {
        t.commit();
      });
    }).then(() => {
      console.log('Moved COMPUTER (12) as a new root');
      done();
    });
  },

]);
