# Hierarchical Data plugin for Bookshelf.js (WIP)

- http://mikehillyer.com/articles/managing-hierarchical-data-in-mysql/
- https://github.com/cakephp/cakephp/blob/master/src/ORM/Behavior/TreeBehavior.php
- https://github.com/PhilWaldmann/openrecord/blob/master/lib/stores/sql/plugins/nested_set.js

## Example

### Insert and delete node

```js
ORM.plugin(require('bookshelf-hierarchy').NestedSetModel);
ORM.transaction(t => {
  new Category().save({name: '3D TV', parent_id: 2}, {transacting: t})
  .then(category => {
    new Category().removeFromTree({id: 8}, {transacting: t}).then(res => {
      t.commit();
    });
  });
})
```

### findChildren

```js
Category.forge().fetchAll({
  findChildren: {
    for: 6,
    direct: false,
  }
})
```

# Todo

- [x] transaction support
- [ ] findPath
- [x] findChildren
- [ ] findTreeList
- [ ] formatTreeList
- [x] removeFromTree
- [ ] moveUp
- [ ] moveDown
- [ ] recover
