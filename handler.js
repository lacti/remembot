'use strict';

const awsServerlessExpress = require('aws-serverless-express');
const express = require('express');
const line = require('@line/bot-sdk');

const app = express();
const bodyParser = require('body-parser');
const server = awsServerlessExpress.createServer(app);

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
};
const client = new line.Client(config);

const mysql = require('mysql');
const dbConfig = {
  host: process.env.DB_HOST,
  user: 'remembot',
  password: process.env.DB_PASSWORD,
  database: 'remembot',
};

const query = (sql) => new Promise((resolve, reject) => {
  let db = mysql.createConnection(dbConfig);
  db.connect();
  db.query(sql, (err, result, fields) => {
    db.end();
    if (err) {
      console.log('error occurred in database query');
      console.log(err);
      reject(err);
    } else {
      resolve(result);
    }
  });
});

app.use(line.middleware(config));
app.use(bodyParser.json());
app.use(
  bodyParser.urlencoded({
    extended: true,
  })
);

app.post('/webhook', (req, res) => {
  Promise.all(req.body.events.map(handleEvent))
    .then(result => res.json(result))
    .catch(error => console.log(error));
});

app.get('/status', (req, res) => {
  res.json('ok');
});

app.post('/push/:id', (req, res) => {
  console.log('id=' + req.params.id);
  console.log(req.body);
  console.log('text=' + req.body.text);
  if (!req.body.text) {
    res.json('no message');
    return;
  }
  client
    .pushMessage(req.params.id, {
      type: 'text',
      text: req.body.text,
    })
    .then(result => res.json(result))
    .catch(error => console.log(error));
});

let showQuestion = (event, sourceId) => {
  return query(`SELECT * FROM word ORDER BY RAND() LIMIT 1`)
    .then(result => {
      const word = result[0];
      console.log(`source=${sourceId}, word=${word}`);
      query(`REPLACE INTO last_word (id, word) VALUES ("${sourceId}", "${word.word}")`);
      return client.replyMessage(event.replyToken, { type: 'text', text: word.word });
    });
};
let responseWord = (event, sourceId, field, proc) => {
  return query(`SELECT * FROM word w INNER JOIN last_word l ON w.word=l.word WHERE l.id="${sourceId}" LIMIT 1`)
    .then(result => {
      const word = result[0];
      console.log(`source=${sourceId}, word=${word}`);
      let value = proc ? proc(word[field]) : word[field];
      return client.replyMessage(event.replyToken, { type: 'text', text: value });
    });
};
let showDescEn = (event, sourceId) => responseWord(event, sourceId, 'description_en');
let showDescKr = (event, sourceId) => responseWord(event, sourceId, 'description_kr');
let showExample = (event, sourceId) => responseWord(event, sourceId, 'examples', val => val.replace(/\|/g, '\n'));

let commands = [
  { cmds: ['문제', 'q'], handler: showQuestion },
  { cmds: ['답', '영어', 'e', 'en'], handler: showDescEn },
  { cmds: ['한글', '설명', 'k', 'kr'], handler: showDescKr },
  { cmds: ['예시', '예', '?', 'ex'], handler: showExample }
];

let findHandler = text => {
  for (let each of commands) {
    for (let cmd of each.cmds) {
      if (text.startsWith(cmd)) {
        return each.handler;
      }
    }
  }
  return null;
};

function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') {
    return Promise.resolve(null);
  }
  if (
    event.replyToken === '00000000000000000000000000000000' ||
    event.replyToken === 'ffffffffffffffffffffffffffffffff'
  ) {
    return Promise.resolve(null);
  }
  console.log(event);

  const text = event.message.text || '';
  const sourceId = event.source.roomId || event.source.groupId || event.source.userId;
  const handler = findHandler(text);
  if (handler) {
    return handler(event, sourceId);
  }
  if (/^[a-zA-Z ]+$/.test(text)) {
    return query(`SELECT * FROM word WHERE word="${text}"`)
      .then(result => {
        if (result && result[0]) {
          const word = result[0];
          console.log(`source=${sourceId}, word=${word}`);
          query(`REPLACE INTO last_word (id, word) VALUES ("${sourceId}", "${word.word}")`);
          return client.replyMessage(event.replyToken, { type: 'text', text: word.description_en });
        } else {
          return client.replyMessage(event.replyToken, {
            type: 'text',
            text: `[${text}]에 대한 새로운 단어 추가는 아직 지원하지 않습니다.`,
          });
        }
      });
  }
}

module.exports.express = (event, context) =>
  awsServerlessExpress.proxy(server, event, context);
