# Hierarchical Data plugin for Bookshelf.js (WIP)

- http://mikehillyer.com/articles/managing-hierarchical-data-in-mysql/
- https://github.com/cakephp/cakephp/blob/master/src/ORM/Behavior/TreeBehavior.php
- https://github.com/PhilWaldmann/openrecord/blob/master/lib/stores/sql/plugins/nested_set.js

## Example

Example data from `test-data.sql`:

```
mysql> source show-tree.sql;
+----+------------------------+
| id | name                   |
+----+------------------------+
|  1 | ELECTRONICS            |
|  2 |   TELEVISIONS          |
|  3 |     TUBE               |
|  4 |     LCD                |
|  5 |     PLASMA             |
|  6 |   PORTABLE ELECTRONICS |
|  7 |     MP3 PLAYERS        |
|  8 |       FLASH            |
|  9 |     CD PLAYERS         |
| 10 |     2 WAY RADIOS       |
+----+------------------------+
```

### Model definition

```js
var Category = ORM.Model.extend({
  tableName: 'nested_category',
  nestedSet: true,
});
```

You can configure the default configuration in the `nestedSet` key:

```js
{
  fields: {
    left: 'lft',
    right: 'rgt',
    parentId: 'parent_id',
  }
}
```

### Insert and delete node

```js
// load the plugin
ORM.plugin(require('bookshelf-hierarchy').NestedSetModel);

// wrap in transaction
ORM.transaction(t => {

  // save a new child node under TELEVISIONS
  new Category().save({name: '3D TV', parent_id: 2}, {transacting: t})
  .then(category => {

    // removes FLASH from under MP3 PLAYERS
    new Category().removeFromTree({id: 8}, {transacting: t}).then(res => {
      t.commit();
    });

  });
})
```

### findChildren

```js
// get children of PORTABLE ELECTRONICS
Category.forge().fetchAll({
  findChildren: {
    for: 6,
    direct: false, // set true to retrieve direct nodes
  }
})
```

### findPath

```js
// get nodes leading to 3D TV (id 11)
Category.forge().fetchAll({
  findPath: {
    for: 11
  },
  transacting: t,
})
```

### setParent

```js
// move TELEVISIONS (2) under PORTABLE ELECTRONICS (6)
new Category().setParent(2, 6, {transacting: t}).then(() => {
  console.log('node moved')
});
```

### Scope

```js
// Configuring scope for a model instance with `section_id` = 2:
new Category({}, {scope: {section_id: 2}}).fetchAll({
})
```

## Running tests

`mysql <dbname> < test-data.sql ; npm test`

# Todo

- [x] transaction support
- [x] findPath
- [x] findChildren
- [ ] findTreeList
- [ ] formatTreeList
- [x] removeFromTree
- [x] setParent
- [ ] moveUp
- [ ] moveDown
- [ ] recover
