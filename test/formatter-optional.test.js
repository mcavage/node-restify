'use strict';
/* eslint-disable func-names */

var restifyClients = require('restify-clients');

var restify = require('../lib');

if (require.cache[__dirname + '/lib/helper.js']) {
    delete require.cache[__dirname + '/lib/helper.js'];
}
var helper = require('./lib/helper.js');

///--- Globals

var after = helper.after;
var before = helper.before;
var test = helper.test;

var CLIENT;
var LOCALHOST;
var PORT = process.env.UNIT_TEST_PORT || 0;
var SERVER;

///--- Tests

before(function(callback) {
    try {
        SERVER = restify.createServer({
            handleUncaughtExceptions: true,
            log: helper.getLog('server'),
            strictFormatters: false
        });
        SERVER.listen(PORT, '127.0.0.1', function() {
            PORT = SERVER.address().port;
            CLIENT = restifyClients.createJsonClient({
                url: 'http://127.0.0.1:' + PORT,
                dtrace: helper.dtrace,
                retry: false
            });
            LOCALHOST = 'http://' + '127.0.0.1:' + PORT;
            callback();
        });
    } catch (e) {
        console.error(e.stack);
        process.exit(1);
    }
});

after(function(callback) {
    try {
        SERVER.close(callback);
        CLIENT.close();
    } catch (e) {
        console.error(e.stack);
        process.exit(1);
    }
});

test('send 200 on formatter missing and strictFormatters false', function(t) {
    // When server is passed "strictFormatters: false" at creation time,
    // res.send still sends a successful response even when a formatter is
    // not set up for a specific content-type.
    SERVER.get('/11', function handle(req, res, next) {
        res.header('content-type', 'application/hal+json');
        res.send(200, JSON.stringify({ hello: 'world' }));
        return next();
    });

    CLIENT.get(LOCALHOST + '/11', function(err, _, res) {
        t.ifError(err);
        t.equal(res.statusCode, 200);
        t.equal(res.headers['content-type'], 'application/hal+json');
        t.end();
    });
});
