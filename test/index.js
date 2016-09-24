require('babel-register');
require('babel-polyfill');

var async = require('async');
var config = require('./knexfile');
var knex = require('knex');
var bookshelf= require('bookshelf');
var bookshelfTree = require('./src');
var ORM = bookshelf(knex(config.development));

ORM.plugin(bookshelfTree.NestedSetModel);

var Category = ORM.Model.extend({
  tableName: 'nested_category',
  nestedSet: true,
});

async.series([

  function(done) {
    ORM.transaction(t => {
      let model = new Category({}, {scope: {section_id: 1}});
      model.save({name: '3D TV', parent_id: 2}, {transacting: t})
      .then(category => {
        Category.forge().fetchAll({
          columns: ['id', 'name'],
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
      }).catch(err => { console.log(err) });
    }).then(() => {
      console.log('Added 3D TV and removed FLASH');
      done();
    });
  },

  function(done) {
    Category.forge().fetchAll({
      columns: ['nested_category.id', 'nested_category.name', 'nested_category.lft', 'nested_category.rgt'],
      findChildren: {
        for: 6,
        direct: false,
      }
    })
    .then(results => {
      console.log('Results for findChildren(6):\n', results.toJSON(), '\n');
      done()
    }).catch(err => { console.log(err) });
  },

  function(done) {
    ORM.transaction(t => {
      new Category().setParent(2, 6, {transacting: t}).then(res => {
        t.commit();
      }).catch(err => { console.log(err) });
    }).then(() => {
      console.log('Moved TELEVISIONS (2) under PORTABLE ELECTRONICS (6)');
      done()
    }).catch(err => { console.log(err) });
  },

  function(done) {
    ORM.transaction(t => {
      new Category({}, {scope: {section_id: 1}}).save({name: 'COMPUTER'}, {transacting: t})
        .then(res => {
          new Category().save({name: 'PC', parent_id: res.get('id')}, {transacting: t}).then(res2 => {
            t.commit();
          })
        });
    }).then(() => {
      console.log('Added a new root node: COMPUTER with one child: PC');
      done();
    }).catch(err => { console.log(err) });
  },

  function(done) {
    ORM.transaction(t => {
      new Category({}, {scope: {section_id: 1}}).setParent(12, 1, {transacting: t}).then(res => {
        t.commit();
      }).catch(err => console.log('setParent err', err));
    }).then(() => {
      console.log('Moved COMPUTER (12) under ELECTRONICS (1)');
      done();
    }).catch(err => { console.log(err) });
  },

  function(done) {
    ORM.transaction(t => {
      new Category().setParent(12, null, {transacting: t}).then(res => {
        t.commit();
      }).catch(err => console.log('FAILED', err));
    }).then(() => {
      console.log('Moved COMPUTER (12) as a new root');
      done();
    }).catch(err => console.log(err));
  },

  function(done) {
    ORM.transaction(t => {
      new Category({}, {scope: {section_id: 2}})
        .save({name: 'Movies'}, {transacting: t})
        .then(res => {
          new Category({}, {scope: {section_id: 2}})
            .save({name: 'Action', parent_id: res.get('id')}, {transacting: t})
            .then(res => {
                t.commit()
            })
        });
    }).then(() => {
      console.log('Added node with new scope');
      done();
    }).catch(err => { console.log(err) });
  },

]);
