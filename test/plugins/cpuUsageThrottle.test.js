'use strict';

var assert = require('chai').assert;
var proxyquire = require('proxyquire');
var restify = require('../../lib/index.js');
var restifyClients = require('restify-clients');

// Allow tests to set the CPU usage returned by pidUsage
var CPU = 50;

var cpuUsageThrottle = proxyquire('../../lib/plugins/cpuUsageThrottle.js', {
    pidusage: {
        stat: function (pid, cb) {
            return cb(null, { cpu: CPU });
        }
    }
});

var MR = Math.random;
describe('cpuUsageThrottle', function () {

    before('Setup: stub math.random', function (done) {
        Math.random = function () {
            return 0;
        };
        done();
    });

    it('Unit: Should shed load', function (done) {
        var opts = { limit: 0, interval: 500 };
        var plugin = cpuUsageThrottle(opts);
        function next (cont) {
            clearTimeout(plugin._timeout);
            assert(cont instanceof Error, 'Should call next with error');
            assert.equal(cont.statusCode, 503, 'Defaults to 503 status');
            done();
        }
        plugin({}, {}, next);
    });

    it('Unit: Should let request through when not under load', function (done) {
        var opts = { interval: 500, limit: 0.9 };
        var plugin = cpuUsageThrottle(opts);
        function next (cont) {
            assert.isUndefined(cont, 'Should call next');
            clearTimeout(plugin._timeout);
            done();
        }
        plugin({}, {}, next);
    });

    it('Unit: Update should update state', function (done) {
        var opts = {
            max: 1,
            limit: 0.9,
            halfLife: 50,
            interval: 50
        };
        var plugin = cpuUsageThrottle(opts);
        opts = {
            max: 0.5,
            limit: 0.1,
            halfLife: 1000,
            interval: 1000
        };
        plugin.update(opts);
        assert.equal(plugin.state.limit, opts.limit, 'opts.limit');
        assert.equal(plugin.state.max, opts.max, 'opts.max');
        assert.equal(plugin.state.halfLife, opts.halfLife, 'opts.halfLife');
        assert.equal(plugin.state.interval, opts.interval, 'opts.interval');
        plugin.close();
        done();
    });


    it('Integration: Should shed load', function (done) {
        var server = restify.createServer();
        var client = {
            close: function () {}
        };
        var opts = { interval: 500, limit: 0 };
        var plugin = cpuUsageThrottle(opts);
        server.pre(plugin);
        server.get('/foo', function (req, res, next) {
            res.send(200);
            next();
        });
        server.listen(0, '127.0.0.1', function () {
            client = restifyClients.createJsonClient({
                url: 'http://127.0.0.1:' + server.address().port,
                retry: false
            });
            client.get({ path: '/foo' }, function (e, _, res) {
                assert(e, 'Second request is shed');
                assert.equal(res.statusCode, 503,
                    'Default shed status code returned');
                clearTimeout(plugin._timeout);
                done();
            });
        });
    });

    after('Teardown: Reset Math.random', function (done) {
        Math.random = MR;
        done();
    });
});
