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
          model.removeFromTree({id: 8}, {transacting: t}).then(res => {
            t.commit();
            done();
          });
        });
      });
    }).then(() => {
      console.log('transaction commited');
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
    // move TELEVISIONS (2) under PORTABLE ELECTRONICS (6)
    ORM.transaction(t => {
      new Category().setParent(2, 6, {transacting: t}).then(res => {
        t.commit();
        done()
      });
    }).then(() => {
      console.log('transaction commited');
    });
  }

]);
