'use strict';
/* eslint-disable func-names */

var Chain = require('../lib/chain');

if (require.cache[__dirname + '/lib/helper.js']) {
    delete require.cache[__dirname + '/lib/helper.js'];
}
var helper = require('./lib/helper.js');

///--- Globals

var test = helper.test;

test('calls all the handlers', function(t) {
    var chain = new Chain();
    var counter = 0;

    chain.add(function(req, res, next) {
        counter++;
        next();
    });
    chain.add(function(req, res, next) {
        counter++;
        next();
    });
    chain.run(
        {
            startHandlerTimer: function() {},
            endHandlerTimer: function() {},
            closed: function() {
                return false;
            }
        },
        {},
        function() {
            t.equal(counter, 2);
            t.done();
        }
    );
});

test('abort with Error in next', function(t) {
    var chain = new Chain();
    var counter = 0;
    var myError = new Error('Foo');

    chain.add(function(req, res, next) {
        counter++;
        next(myError);
    });
    chain.add(function(req, res, next) {
        counter++;
        next();
    });
    chain.run(
        {
            startHandlerTimer: function() {},
            endHandlerTimer: function() {},
            closed: function() {
                return false;
            }
        },
        {},
        function(err) {
            t.deepEqual(err, myError);
            t.equal(counter, 1);
            t.done();
        }
    );
});

test('abort with false in next', function(t) {
    var chain = new Chain();

    chain.add(function(req, res, next) {
        next(false);
    });
    chain.add(function(req, res, next) {
        t.fail('Should not be here');
        next();
    });
    chain.run(
        {
            startHandlerTimer: function() {},
            endHandlerTimer: function() {},
            closed: function() {
                return false;
            }
        },
        {},
        function(err) {
            t.equal(err, false);
            t.done();
        }
    );
});

test('abort with closed request', function(t) {
    var chain = new Chain();
    var closed = false;

    chain.add(function(req, res, next) {
        closed = true;
        next();
    });
    chain.add(function(req, res, next) {
        t.fail('Should not be here');
    });
    chain.run(
        {
            startHandlerTimer: function() {},
            endHandlerTimer: function() {},
            closed: function() {
                return closed;
            }
        },
        {},
        function(err) {
            t.ifError(err);
            t.done();
        }
    );
});

test('cals error middleware', function(t) {
    t.expect(2);
    var chain = new Chain();
    var myError = new Error('Foo');

    chain.add(function(req, res, next) {
        next(myError);
    });
    chain.add(function(err, req, res, next) {
        t.deepEqual(err, myError);
        next(err);
    });
    chain.add(function(req, res, next) {
        t.fail('Should not be here');
    });
    chain.run(
        {
            startHandlerTimer: function() {},
            endHandlerTimer: function() {},
            closed: function() {
                return false;
            }
        },
        {},
        function(err) {
            t.deepEqual(err, myError);
            t.done();
        }
    );
});

test('onceNext prevents double next calls', function(t) {
    var doneCalled = 0;
    var chain = new Chain({
        onceNext: true
    });

    chain.add(function foo(req, res, next) {
        next();
        next();
    });

    chain.run(
        {
            startHandlerTimer: function() {},
            endHandlerTimer: function() {},
            closed: function() {
                return false;
            }
        },
        {},
        function(err) {
            t.ifError(err);
            doneCalled++;
            t.equal(doneCalled, 1);
            t.done();
        }
    );
});

test('throws error for double next calls in strictNext mode', function(t) {
    var doneCalled = 0;
    var chain = new Chain({
        strictNext: true
    });

    chain.add(function foo(req, res, next) {
        next();
        next();
    });

    try {
        chain.run(
            {
                startHandlerTimer: function() {},
                endHandlerTimer: function() {},
                closed: function() {
                    return false;
                }
            },
            {},
            function(err) {
                t.ifError(err);
                doneCalled++;
                t.equal(doneCalled, 1);
                t.done();
            }
        );
    } catch (err) {
        t.equal(err.message, "next shouldn't be called more than once");
    }
});

test('calls req.startHandlerTimer', function(t) {
    var chain = new Chain();

    chain.add(function foo(req, res, next) {
        next();
    });

    chain.run(
        {
            startHandlerTimer: function(handleName) {
                t.equal(handleName, 'foo');
                t.done();
            },
            endHandlerTimer: function() {},
            closed: function() {
                return false;
            }
        },
        {},
        function() {}
    );
});

test('calls req.endHandlerTimer', function(t) {
    var chain = new Chain();

    chain.add(function foo(req, res, next) {
        next();
    });

    chain.run(
        {
            startHandlerTimer: function() {},
            endHandlerTimer: function(handleName) {
                t.equal(handleName, 'foo');
                t.done();
            },
            closed: function() {
                return false;
            }
        },
        {},
        function() {}
    );
});

test('count returns with the number of registered handlers', function(t) {
    var chain = new Chain();
    chain.add(function(req, res, next) {});
    chain.add(function(req, res, next) {});
    t.equal(chain.count(), 2);
    t.end();
});

test('getHandlers returns with the array of handlers', function(t) {
    var chain = new Chain();
    var handlers = [function(req, res, next) {}, function(req, res, next) {}];
    chain.add(handlers[0]);
    chain.add(handlers[1]);
    t.deepEqual(chain.getHandlers(), handlers);
    t.end();
});
