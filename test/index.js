import chai from 'chai'
import config from './knexfile';
import 'babel-polyfill';
import bookshelf from 'bookshelf';
import bookshelfTree from '../src';
import knex from 'knex';

const assert = chai.assert;
const ORM = bookshelf(knex(config.development));

ORM.plugin(bookshelfTree.NestedSetModel);
ORM.plugin('pagination');

const Category = ORM.Model.extend({
  tableName: 'nested_category',
  nestedSet: true,
});

describe('index.js', () => {

  it('should add 3D TV and removed FLASH', (done) => {
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
          let json = results.toJSON();
          assert(json[2].name == '3D TV');
          new Category().removeFromTree({id: 8}, {transacting: t}).then(res => {
            t.commit();
          });
        });
      }).catch(err => { console.log(err) });
    }).then(() => {
      done();
    });
  });

  it('should return a list on children', (done) => {
    Category.forge().fetchAll({
      columns: ['nested_category.id', 'nested_category.name', 'nested_category.lft', 'nested_category.rgt'],
      findChildren: {
        for: 6,
        direct: false,
      }
    })
    .then(results => {
      let json = results.toJSON();
      assert(json.length === 3);
      done()
    }).catch(err => { console.log(err) });
  });

  it('should move TELEVISIONS (2) under PORTABLE ELECTRONICS (6)', (done) => {
    ORM.transaction(t => {
      new Category().setParent(2, 6, {transacting: t}).then(res => {
        assert(res > 0, 'more than one row is updated');
        assert(res === 9, 'exactly nine rows has been updated');
        t.commit();
      }).catch(err => { console.log(err) });
    }).then(() => {
      done()
    }).catch(err => { console.log(err) });
  });

  it('should added a new root node: COMPUTER with one child: PC', (done) => {
    ORM.transaction(t => {
      new Category({}, {scope: {section_id: 1}}).save({name: 'COMPUTER'}, {transacting: t})
        .then(res => {
          new Category().save({name: 'PC', parent_id: res.get('id')}, {transacting: t}).then(res2 => {
            let json = res2.toJSON();
            assert(json.name == 'PC')
            assert(json.section_id === 1)
            t.commit();
          })
        });
    }).then(() => {
      done();
    }).catch(err => { console.log(err) });
  });

  it('should move COMPUTER (12) under ELECTRONICS (1)', (done) => {
    ORM.transaction(t => {
      new Category({}, {scope: {section_id: 1}}).setParent(12, 1, {transacting: t}).then(res => {
        assert(res === 3, 'exactly 3 rows has been updated');
        t.commit();
      }).catch(err => console.log('setParent err', err));
    }).then(() => {
      done();
    }).catch(err => { console.log(err) });
  });

  it('should move COMPUTER (12) as a new root', (done) => {
    ORM.transaction(t => {
      new Category().setParent(12, null, {transacting: t}).then(res => {
        assert(res === 3, 'exactly 3 rows has been updated');
        new Category({id: 12}).fetch({transacting: t}).then(res => {
          assert(res.get('parent_id') === null, 'parent is must be null');
          t.commit();
        });
      }).catch(err => console.log('FAILED', err));
    }).then(() => {
      done();
    }).catch(err => console.log(err));
  });

  it('should add a new node with different scope', (done) => {
    ORM.transaction(t => {
      new Category({}, {scope: {section_id: 2}})
        .save({name: 'Movies'}, {transacting: t})
        .then(res => {
          new Category({}, {scope: {section_id: 2}})
            .save({name: 'Action', parent_id: res.get('id')}, {transacting: t})
            .then(res => {
              let json = res.toJSON();
              assert(json.section_id == 2, 'Scope field is filled correctly');
              t.commit()
            })
        });
    }).then(() => {
      done();
    }).catch(err => { console.log(err) });
  });

  it('should move a node upwards', (done) => {
    ORM.transaction(t => {
      new Category().moveUp(10, 2, {transacting: t}).then(res => {
        t.commit();
      }).catch((err) => console.log(err));
    }).then(() => {
      done()
    });
  });

});
