'use strict'

const awsServerlessExpress = require('aws-serverless-express')
const express = require('express')
const line = require('@line/bot-sdk')

const app = express()
const server = awsServerlessExpress.createServer(app)

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
}
const client = new line.Client(config)

app.post('/webhook', line.middleware(config), (req, res) => {
  Promise
    .all(req.body.events.map(handleEvent))
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
  const echo = { type: 'text', text: event.message.text }
  return client.replyMessage(event.replyToken, echo)
}

module.exports.webhook = (event, context) => awsServerlessExpress.proxy(server, event, context);

