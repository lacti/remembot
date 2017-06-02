'use strict'

const awsServerlessExpress = require('aws-serverless-express')
const express = require('express')
const line = require('@line/bot-sdk')

const app = express()
const bodyParser = require('body-parser')
const server = awsServerlessExpress.createServer(app)

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
}
const client = new line.Client(config)

app.use(line.middleware(config))
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({
  extended: true
}))

app.post('/webhook', (req, res) => {
  Promise
    .all(req.body.events.map(handleEvent))
    .then(result => res.json(result))
    .catch(error => console.log(error))
})

app.get('/status', (req, res) => {
  res.json("ok");
})

app.post('/push/:id', (req, res) => {
  console.log('id=' + req.params.id)
  console.log(req.body)
  console.log('text=' + req.body.text)
  if (!req.body.text) {
    res.json('no message');
    return;
  }
  client.pushMessage(req.params.id, {
    type: 'text',
    text: req.body.text
  })
  .then(result => res.json(result))
  .catch(error => console.log(error))
})

function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') {
    return Promise.resolve(null)
  }
  if (event.replyToken === '00000000000000000000000000000000'
      || event.replyToken === 'ffffffffffffffffffffffffffffffff') {
    return Promise.resolve(null)
  }
  console.log(event)
  const echo = { type: 'text', text: event.message.text }
  return client.replyMessage(event.replyToken, echo)
}

module.exports.express = (event, context) => awsServerlessExpress.proxy(server, event, context);

