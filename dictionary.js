'use strict';

const rp = require('request-promise');
const cheerio = require('cheerio');
const db = require('./db.js');

let rpOf = url => {
  console.log(`read url from ${url}`);
  return rp({
    uri: url,
    transform: cheerio.load,
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36'
    }
  });
};

let registerEnglish = word => {
  return db
    .query('DELETE FROM endic WHERE word=?', [word])
    .then(() => {
      return rpOf(
        'http://dictionary.cambridge.org/dictionary/english/' + word
      ).then($ => {
        let promises = [];
        $('div.entry-body div.clrd').each(function() {
          const clrd = $(this);
          const groupPos = $('div.pos-header span.posgram span.pos', clrd)
            .text()
            .replace(/\s+/g, ' ')
            .trim();

          $('div.sense-block', $(this)).each(function() {
            const sense = $(this);
            const pos =
              $('h4.txt-block span.pos', sense)
                .text()
                .replace(/\s+/g, ' ')
                .trim() || groupPos;
            const guideword = $('span.guideword', sense)
              .text()
              .replace(/\s+/g, ' ')
              .trim();
            let defs = [];
            let examples = [];
            $('div.def-block', sense).each(function() {
              defs.push($('b.def', $(this)).text().replace(/\s+/g, ' ').trim());
            });
            $('div.examp', sense).each(function() {
              examples.push($(this).text().replace(/\s+/g, ' ').trim());
            });

            promises.push(
              db.query(
                'INSERT INTO endic (word, pos, guide, meaning, example) VALUES (?, ?, ?, ?, ?)',
                [word, pos, guideword, defs.join('\n'), examples.join('\n')]
              )
            );
            console.log(pos);
            console.log(guideword);
            console.log(defs);
            console.log(examples);
          });
        });
        return Promise.all(promises);
      });
    })
    .catch(console.log);
};

let registerKorean = word => {
  return db
    .query('DELETE FROM kodic WHERE word=?', [word])
    .then(() => {
      return rpOf(
        'http://endic.naver.com/search.nhn?sLn=kr&query=' + word
      ).then($ => {
        const main = $(
          '#content > div:nth-child(4) > dl > dd:nth-child(2) > div > p:nth-child(1)'
        )
          .text()
          .replace(/\s+/g, ' ')
          .trim();
        const additional = $(
          '#content > div:nth-child(4) > dl > dd:nth-child(2) > div > p.pad6'
        )
          .text()
          .replace(/\s+/g, ' ')
          .trim();

        let descriptions = [];
        if (main !== '') descriptions.push(main);
        if (additional !== '') {
          descriptions.push(
            additional.indexOf(':') > 0
              ? additional.substring(additional.indexOf(':') + 1).trim()
              : additional
          );
        }
        console.log(descriptions);
        return db.query('INSERT INTO kodic (word, meaning) VALUES (?, ?)', [
          word,
          descriptions.join('\n')
        ]);
      });
    })
    .catch(console.log);
};

let findWord = word => {
  return Promise.all([
    db.query('SELECT * FROM endic WHERE word=?', [word]),
    db.query('SELECT * FROM kodic WHERE word=?', [word])
  ])
    .then(dics => {
      let en = [];
      let ko = [];
      for (let each of dics[0]) {
        en.push(each);
      }
      for (let each of dics[1]) {
        ko.push(each);
      }
      let exists = en.length > 0 || ko.length > 0;
      return { exists, en, ko };
    })
    .catch(console.log);
};

let registerWord = word => {
  return db
    .query('REPLACE INTO word_queue (word, endic, kodic) VALUES (?, 0, 0)', [
      word
    ])
    .then(() => registerEnglish(word))
    .then(success =>
      db.query('UPDATE word_queue SET endic=? WHERE word=?', [
        success ? 1 : 0,
        word
      ])
    )
    .then(() => registerKorean(word))
    .then(success =>
      db.query('UPDATE word_queue SET kodic=? WHERE word=?', [
        success ? 1 : 0,
        word
      ])
    )
    .catch(console.log);
};

let recoverUnregisterWord = () => {
  return db
    .query('SELECT * FROM word_queue WHERE endic=0 OR kodic=0 LIMIT 1')
    .then(words => {
      const q = words[0];
      if (q === undefined || q.word === undefined) {
        return true;
      }
      let promises = [];
      console.log(`[${q.word}]`);
      if (q.endic === 0) {
        promises.push(
          registerEnglish(q.word).then(() =>
            db.query('UPDATE word_queue SET endic=1 WHERE word=?', [q.word])
          )
        );
      }
      if (q.kodic === 0) {
        promises.push(
          registerKorean(q.word).then(() =>
            db.query('UPDATE word_queue SET kodic=1 WHERE word=?', [q.word])
          )
        );
      }
      return Promise.all(promises).then(() => recoverUnregisterWord());
    })
    .catch(console.log);
};

let findOrRegisterWord = word => {
  return findWord(word)
    .then(w => {
      if (w.exists) {
        return w;
      }
      return registerWord(word).then(() => findWord(word));
    })
    .catch(console.log);
};

let chooseRandomWord = () => {
  return db.query('SELECT word FROM word_queue WHERE endic=1 ORDER BY RAND() LIMIT 1')
    .then(res => {
      return res[0].word;
    });
};

let shortPos = pos => {
  switch (pos) {
    case 'noun':
      return 'n';
    case 'verb':
      return 'v';
    case 'adjective':
      return 'adj';
    case 'adverb':
      return 'adv';
    case 'adjectiveadverb':
      return 'adjv';      
    default:
      return pos;
  };
};

let explain = word => {
  return findOrRegisterWord(word).then(w => {
    const maxLength = 1200;
    if (w.exists === false) {
      return { exists: false };
    }
    let descriptions = [];
    let guides = [];

    descriptions.push(`${word}:`);
    if (w.en !== undefined) {
      var count = 0;
      for (let en of w.en) {
        if (en.guide !== undefined && en.guide.length > 0) {
          guides.push(en.guide.replace(/\(|\)/g, '').toLowerCase());
        }
        let pos = shortPos(en.pos);
        let meanings = en.meaning.split('\n');
        for (let meaning of meanings) {
          descriptions.push(`[${pos}] ${meaning}`);
        }
        if (en.example !== undefined && en.example.length > 0) {
          let examples = en.example.split('\n');
          for (let example of examples) {
            descriptions.push(` - ${example}`);
          }
        }
        // check message exceeded
        let length = descriptions.map(e => e.length).reduce((a, b) => a+b)
          + guides.map(e => e.length).reduce((a, b) => a+b);
        if (length >= maxLength) {
          break;
        }
      }
    }
    if (w.ko !== undefined) {
      for (let ko of w.ko) {
        if (ko.meaning !== undefined && ko.meaning.length > 0) {
          descriptions.push(ko.meaning);
        }
      }
    }
    let texts = [];
    if (descriptions.length > 0) {
      texts.push(descriptions.join('\n'));
    }
    let guideSet = [...new Set(guides)];
    if (guideSet.length > 0) {
      texts.push('Help: ' + guideSet.join(', '));
    }
    if (texts.length == 0) {
      texts.push(`Sorry, but I don't know.`);
    }
    return texts;
  });
};

let index = prefix => {
  if (prefix === undefined || prefix.trim().length == 0) {
    return db.query('SELECT DISTINCT LEFT(word, 1) AS first FROM remembot.word_queue WHERE endic=1')
      .then(res => {
        let firsts = [];
        for (let each of res) {
          firsts.push(each.first);
        }
        return firsts.join('\n');
      });
  }
  return db.query(`SELECT word FROM word_queue WHERE endic=1 AND word LIKE "${prefix.trim()}%"`)
    .then(res => {
      let words = [];
      for (let each of res) {
        words.push(each.word);
      }
      return words.join('\n');
    });
};

module.exports = {
  registerEnglish,
  registerKorean,
  findWord,
  registerWord,
  findOrRegisterWord,
  recoverUnregisterWord,
  chooseRandomWord,
  shortPos,
  explain,
  index
};
