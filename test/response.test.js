'use strict';

var url = require('url');

var restify = require('../lib');

if (require.cache[__dirname + '/lib/helper.js']) {
    delete require.cache[__dirname + '/lib/helper.js'];
}
var helper = require('./lib/helper.js');


///--- Globals

var after = helper.after;
var before = helper.before;
var test = helper.test;

var PORT = process.env.UNIT_TEST_PORT || 0;
var CLIENT;
var SERVER;

var LOCALHOST;
var SLOCALHOST;

var simpleFormatter = function ( req, res, body, formatterCb ) {
    var data = JSON.stringify({ customFormatterUsed: 'simple' });
    return formatterCb( null, data );
};

var overrideFormatter = function ( req, res, body, formatterCb ) {
    var data = JSON.stringify({ customFormatterUsed: 'override' });
    res.setHeader('Content-Type', 'application/json' );
    return formatterCb( null, data );
};

var extensionFormatter = function ( req, res, body, cb ) {
    var data = JSON.stringify({ customFormatterUsed: 'extension' });
    return cb( null, data );
};

var customFormatters = {
    'application/vnd.restify.simple+json': simpleFormatter,
    'application/vnd.restify.override+json': overrideFormatter,
    'application/vnd.restify.extension+json;q=0.1;ext=hola': extensionFormatter
};

before(function (cb) {
    try {
        SERVER = restify.createServer({
            dtrace: helper.dtrace,
            log: helper.getLog('server'),
            version: ['2.0.0', '0.5.4', '1.4.3'],
            formatters: customFormatters
        });
        SERVER.use(restify.queryParser());
        SERVER.listen(PORT, '127.0.0.1', function () {
            PORT = SERVER.address().port;
            CLIENT = restify.createJsonClient({
                url: 'http://127.0.0.1:' + PORT,
                dtrace: helper.dtrace,
                retry: false
            });
            LOCALHOST = 'http://' + '127.0.0.1:' + PORT;
            SLOCALHOST = 'https://' + '127.0.0.1:' + PORT;

            cb();
        });
    } catch (e) {
        console.error(e.stack);
        process.exit(1);
    }
});


after(function (cb) {
    try {
        CLIENT.close();
        SERVER.close(function () {
            CLIENT = null;
            SERVER = null;
            cb();
        });
    } catch (e) {
        console.error(e.stack);
        process.exit(1);
    }
});


// helper for joining array into strings
function join() {
    var args = [].slice.call(arguments, 0);
    return (args.join(''));
}


test('redirect to new string url as-is', function (t) {
    SERVER.get('/1', function (req, res, next) {
        res.redirect('www.foo.com', next);
    });

    CLIENT.get(join(LOCALHOST, '/1'), function (err, _, res) {
        t.ifError(err);
        t.equal(res.statusCode, 302);
        t.equal(res.headers.location, 'www.foo.com');
        t.end();
    });
});

test('redirect to new relative string url as-is', function (t) {
    SERVER.get('/20', function (req, res, next) {
        res.redirect('/1', next);
    });

    CLIENT.get(join(LOCALHOST, '/20'), function (err, _, res) {
        t.ifError(err);
        t.equal(res.statusCode, 302);
        t.equal(res.headers.location, '/1');
        t.end();
    });
});


test('redirect to current url (reload)', function (t) {
    SERVER.get('/2', function (req, res, next) {
        res.redirect({
            reload: true
        }, next);
    });

    CLIENT.get(join(LOCALHOST, '/2'), function (err, _, res) {
        t.ifError(err);
        t.equal(res.statusCode, 302);
        t.equal(res.headers.location, join(LOCALHOST, '/2'));
        t.end();
    });
});


test('redirect to current url from http -> https', function (t) {
    SERVER.get('/3', function (req, res, next) {
        res.redirect({
            secure: true
        }, next);
    });

    CLIENT.get(join(LOCALHOST, '/3'), function (err, _, res) {
        t.ifError(err);
        t.equal(res.statusCode, 302);
        t.equal(res.headers.location, join(SLOCALHOST, '/3'));
        t.end();
    });
});


test('redirect to current url from https -> http', function (t) {
    SERVER.get('/3', function (req, res, next) {
        res.redirect({
            reload: true,
            secure: false
        }, next);
    });

    CLIENT.get(join(LOCALHOST, '/3'), function (err, _, res) {
        t.ifError(err);
        t.equal(res.statusCode, 302);
        t.equal(res.headers.location, join(LOCALHOST, '/3'));
        t.end();
    });
});


test('redirect by changing path', function (t) {
    SERVER.get('/4', function (req, res, next) {
        res.redirect({
            pathname: '1'
        }, next);
    });

    CLIENT.get(join(LOCALHOST, '/4'), function (err, _, res) {
        t.ifError(err);
        t.equal(res.statusCode, 302);
        t.equal(res.headers.location, join(LOCALHOST, '/1'));
        t.end();
    });
});

test('redirect should add query params', function (t) {
    SERVER.get('/5', function (req, res, next) {
        res.redirect({
            query: {
                a: 1
            }
        }, next);
    });

    CLIENT.get(join(LOCALHOST, '/5'), function (err, _, res) {
        t.ifError(err);
        t.equal(res.statusCode, 302);
        t.equal(res.headers.location, join(LOCALHOST, '/5?a=1'));
        t.end();
    });
});


test('redirect should extend existing query params', function (t) {
    SERVER.get('/6', function (req, res, next) {
        res.redirect({
            query: {
                b: 2
            }
        }, next);
    });

    CLIENT.get(join(LOCALHOST, '/6?a=1'), function (err, _, res) {
        t.ifError(err);
        t.equal(res.statusCode, 302);
        var parsedUrl = url.parse(res.headers.location, true);
        t.deepEqual(parsedUrl.query, {
            a: 1,
            b: 2
        });
        t.equal(parsedUrl.query.b, 2);
        t.equal(parsedUrl.pathname, '/6');

        // t.equal(res.headers.location, join(LOCALHOST, '/6?a=1&b=2'));
        t.end();
    });
});


test('redirect should stomp over existing query params', function (t) {
    SERVER.get('/7', function (req, res, next) {
        res.redirect({
            overrideQuery: true,
            query: {
                b: 2
            }
        }, next);
    });

    CLIENT.get(join(LOCALHOST, '/7?a=1'), function (err, _, res) {
        t.ifError(err);
        t.equal(res.statusCode, 302);
        t.equal(res.headers.location, join(LOCALHOST, '/7?b=2'));
        t.end();
    });
});


test('redirect with 301 status code', function (t) {
    SERVER.get('/8', function (req, res, next) {
        res.redirect({
            permanent: true
        }, next);
    });

    CLIENT.get(join(LOCALHOST, '/8'), function (err, _, res) {
        t.ifError(err);
        t.equal(res.statusCode, 301);
        t.equal(res.headers.location, join(LOCALHOST, '/8'));
        t.end();
    });
});


test('redirect with 301 status code ising string url', function (t) {
    SERVER.get('/30', function (req, res, next) {
        res.redirect(301, '/foo', next);
    });

    CLIENT.get(join(LOCALHOST, '/30'), function (err, _, res) {
        t.ifError(err);
        t.equal(res.statusCode, 301);
        t.equal(res.headers.location, '/foo');
        t.end();
    });
});


test('redirect using options.url', function (t) {
    SERVER.get('/8', function (req, res, next) {
        res.redirect({
            hostname: 'www.foo.com',
            pathname: '/8',
            query: {
                a: 1
            }
        }, next);
    });

    CLIENT.get(join(LOCALHOST, '/8'), function (err, _, res) {
        t.ifError(err);
        t.equal(res.statusCode, 302);
        t.equal(res.headers.location, 'http://www.foo.com/8?a=1');
        t.end();
    });
});


// jscs:disable maximumLineLength
test('redirect should cause InternalServerError when invoked without next', function (t) {

    SERVER.get('/9', function (req, res, next) {
        res.redirect();
    });

    CLIENT.get(join(LOCALHOST, '/9'), function (err, _, res) {
        t.equal(res.statusCode, 500);

        // json parse the response
        var msg = JSON.parse(res.body);
        t.equal(msg.code, 'InternalError');
        t.end();
    });
});

// jscs:enable maximumLineLength

test('redirect should call next with false to stop ' +
      'handler stack execution', function (t) {
    var wasRun = false;

    function A(req, res, next) {
        req.a = 1;
        next();
    }
    function B(req, res, next) {
        req.b = 2;
        wasRun = true;
        next();
    }
    function redirect(req, res, next) {
        res.redirect('/10', next);
    }

    SERVER.get('/10', [A, redirect, B]);

    CLIENT.get(join(LOCALHOST, '/10'), function (err, _, res) {
        t.ifError(err);
        t.equal(res.statusCode, 302);
        t.equal(res.headers.location, '/10');

        // handler B should not be executed
        t.equal(wasRun, false);
        t.end();
    });
});


test('should fail to set header due to missing formatter', function (t) {

    // when a formatter is not set up for a specific content-type, restify will
    // default to octet-stream.

    SERVER.get('/11', function handle(req, res, next) {
        res.header('content-type', 'application/hal+json');
        res.send(200, JSON.stringify({ hello: 'world' }));
        return next();
    });

    CLIENT.get(join(LOCALHOST, '/11'), function (err, _, res) {
        t.ifError(err);
        t.equal(res.statusCode, 200);
        t.equal(res.headers['content-type'], 'application/octet-stream');
        t.end();
    });
});


test('GH-1219 right formatter based on accept header', function (t) {

    SERVER.get('/12', function handle(req, res, next) {
        res.send( 200, JSON.stringify({ hello: 'world' }));
        return next();
    });

    var req = {
        path: '/12',
        headers: {
            accept: 'application/vnd.restify.simple+json'
        }
    };

    CLIENT.get( req, function (err, _, res) {
        t.ifError(err);
        t.equal(res.statusCode, 200);
        var expected = 'application/vnd.restify.simple+json';
        t.equal(res.headers['content-type'], expected);
        t.equal(res.body, '{"customFormatterUsed":"simple"}');
        t.end();
    });
});


test('GH-1219 right formatter when the accept includes quality', function (t) {

    SERVER.get('/13', function handle(req, res, next) {
        res.send( 200, JSON.stringify({ hello: 'world' }));
        return next();
    });

    var req = {
        path: '/13',
        headers: {
            accept: 'application/vnd.restify.simple+json;q=1'
        }
    };

    CLIENT.get( req, function (err, _, res) {
        t.ifError(err);
        t.equal(res.statusCode, 200);
        var expected = 'application/vnd.restify.simple+json';
        t.equal(res.headers['content-type'], expected);
        t.equal(res.body, '{"customFormatterUsed":"simple"}');
        t.end();
    });
});


test('GH-1219 right formatter when using an known extension', function (t) {

    SERVER.get('/14', function handle(req, res, next) {
        res.send( 200, JSON.stringify({ hello: 'world' }));
        return next();
    });

    var req = {
        path: '/14',
        headers: {
            accept: 'application/vnd.restify.extension+json;ext=known'
        }
    };

    CLIENT.get( req, function (err, _, res) {
        t.ifError(err);
        t.equal(res.statusCode, 200);
        var expected = 'application/vnd.restify.extension+json';
        t.equal(res.headers['content-type'], expected);
        t.equal(res.body, '{"customFormatterUsed":"extension"}');
        t.end();
    });
});

test('GH-1219 right formatter when using an unknown extension', function (t) {

    SERVER.get('/15', function handle(req, res, next) {
        res.send( 200, JSON.stringify({ hello: 'world' }));
        return next();
    });

    var req = {
        path: '/15',
        headers: {
            accept: 'application/vnd.restify.extension+json;ext=unknown'
        }
    };

    CLIENT.get( req, function (err, _, res) {
        t.ifError(err);
        t.equal(res.statusCode, 200);
        var expected = 'application/vnd.restify.extension+json';
        t.equal(res.headers['content-type'], expected);
        t.equal(res.body, '{"customFormatterUsed":"extension"}');
        t.end();
    });
});
