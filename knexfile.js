// Update with your config settings.

module.exports = {

  development: {
    client: 'mysql',
    connection: {
      database: 'test',
      user:     'root',
      password: 'password',
      timezone: 'UTC'
    },
    debug: true,
    migrations: {
      directory: './migrations',
      tableName: 'migrations',
    },
    //debug: true,
  },

};
