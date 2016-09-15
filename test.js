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

new Category().save({name: '3D TV', parent_id: 2});
