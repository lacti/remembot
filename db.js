'use strict';

const mysql = require('mysql');
const dbConfig = {
  host: process.env.DB_HOST,
  user: 'remembot',
  password: process.env.DB_PASSWORD,
  database: 'remembot'
};

exports.query = (sql, params) =>
  new Promise((resolve, reject) => {
    let db = mysql.createConnection(dbConfig);
    db.connect();
    db.query(sql, params, (err, result, fields) => {
      db.end();
      if (err) {
        console.log(`error occurred in database query=${sql}, error=${err}`);
        reject(err);
      } else {
        resolve(result);
      }
    });
  });
