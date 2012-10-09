// Copyright 2012 Mark Cavage, Inc.  All rights reserved.

var EventEmitter = require('events').EventEmitter;
var url = require('url');
var util = require('util');

var assert = require('assert-plus');
var semver = require('semver');

var errors = require('./errors');



///--- Globals

var maxSatisfying = semver.maxSatisfying;

var BadRequestError = errors.BadRequestError;
var InvalidArgumentError = errors.InvalidArgumentError;
var InvalidVersionError = errors.InvalidVersionError;
var MethodNotAllowedError = errors.MethodNotAllowedError;
var ResourceNotFoundError = errors.ResourceNotFoundError;
var UnsupportedMediaTypeError = errors.UnsupportedMediaTypeError;



///--- Helpers


function getName(method, path, version, type) {
        var name =
                method + '_' +
                path +
                '_[' + version.join(', ') + ']' +
                '_[' + type.join(', ') + ']';

        return (name);
}


function matchContentType(t1, t2) {
        t1 = t1.split('/');
        t2 = t2.split('/');

        t1[1] = t1[1].split(';');
        t2[1] = t2[1].split(';');

        if (t1[0] !== t2[0] && t1[0] !== '*')
                return (false);

        if (t1[1][0] !== t2[1][0] && t1[1][0] !== '*')
                return (false);

        if (t1[1].length !== t2[1].length)
                return (false);

        t1[1].sort();
        t2[1].sort();
        for (var i = 0; i < t1[1].length; i++) {
                if (t1[1][i] !== t2[1][i] &&
                    t1[1][i] !== '*')
                        return (false);
        }

        return (true);
}


function matchURL(re, req) {
        var i = 0;
        var result = re.exec(req.getPath() || req.url);
        var params = {};

        if (!result)
                return (false);

        // This means the user original specified a regexp match, not a url
        // string like /:foo/:bar
        if (!re.restifyParams) {
                for (i = 1; i < result.length; i++)
                        params[(i - 1)] = result[i];

                return (params);
        }

        // This was a static string, like /foo
        if (re.restifyParams.length === 0)
                return (params);

        // This was the "normal" case, of /foo/:id
        re.restifyParams.forEach(function (p) {
                if (++i < result.length)
                        params[p] = decodeURIComponent(result[i]);
        });

        return (params);
}


function compileURL(u) {
        if (u instanceof RegExp)
                return (u);
        assert.string(u, 'url');

        var params = [];
        var pattern = '^';
        var re;
        var _url = url.parse(u).pathname;
        _url.split('/').forEach(function (frag) {
                if (frag.length <= 0)
                        return (false);

                pattern += '\\/+';
                if (frag.charAt(0) === ':') {
                        // Strictly adhere to RFC3986
                        pattern += '([a-zA-Z0-9-_~\\.%]+)';
                        params.push(frag.slice(1));
                } else {
                        pattern += frag;
                }

                return (true);
        });

        if (pattern === '^')
                pattern += '\\/';
        pattern += '$';

        re = new RegExp(pattern);
        re.restifyParams = params;

        return (re);
}



///--- API

function Router(options) {
        assert.object(options, 'options');
        assert.object(options.log, 'options.log');

        EventEmitter.call(this);

        this.contentType = options.contentType || [];
        if (!Array.isArray(this.contentType))
                this.contentType = [this.contentType];
        assert.arrayOfString(this.contentType, 'options.contentType');

        this.log = options.log;
        this.mounts = {};
        this.name = 'RestifyRouter';

        // A list of methods to routes
        this.routes = {
                DELETE: [],
                GET: [],
                HEAD: [],
                PATCH: [],
                POST: [],
                PUT: []
        };

        // So we can retrun 405 vs 404, we maintain a reverse mapping of URLs
        // to method
        this.reverse = {};

        this.version = options.version || [];
        if (!Array.isArray(this.version))
                this.version = [this.version];
        assert.arrayOfString(this.version, 'options.version');

        this.version.forEach(function (v) {
                if (semver.valid(v))
                        return (true);

                throw new InvalidArgumentError('%s is not a valid semver', v);
        });
        this.version.sort();

}
util.inherits(Router, EventEmitter);
module.exports = Router;


Router.prototype.mount = function mount(options) {
        assert.object(options, 'options');
        assert.string(options.method, 'options.method');

        var exists;
        var route;
        var routes = this.routes[options.method];
        var self = this;
        var type = options.contentType || self.contentType;
        var version = options.version || self.version;

        if (!Array.isArray(type))
                type = [type];
        type.sort();

        if (!Array.isArray(version))
                version = [version];
        version.sort();

        var name = getName(options.method, options.path, version, type);
        exists = routes.some(function (r) {
                return (r.name === name);
        });
        if (exists)
                return (false);

        route = {
                name: name,
                method: options.method,
                path: compileURL(options.path || options.url),
                type: type,
                version: version
        };
        routes.push(route);

        if (!this.reverse[route.path.source])
                this.reverse[route.path.source] = [];

        if (this.reverse[route.path.source].indexOf(route.method) === -1)
                this.reverse[route.path.source].push(route.method);

        this.mounts[route.name] = route;
        return (route.name);
};


Router.prototype.unmount = function unmount(name) {
        var route = this.mounts[name];
        if (!route) {
                this.log.warn('router.unmount(%s): route does not exist', name);
                return (false);
        }

        var reverse = this.reverse[route.path.source];
        var routes = this.routes[route.method];
        this.routes[route.method] = routes.filter(function (r) {
                return (r.name !== route.name);
        });

        this.reverse[route.path.source] = reverse.filter(function (r) {
                return (r !== route.method);
        });

        if (this.reverse[route.path.source].length === 0)
                delete this.reverse[route.path.source];

        delete this.mounts[name];

        return (name);
};


Router.prototype.find = function find(req, res, callback) {
        var params;
        var r;
        var routes = this.routes[req.method] || [];
        var typed;
        var ver;

        for (var i = 0; i < routes.length; i++) {
                try {
                        params = matchURL(routes[i].path, req);
                } catch (e) {
                        this.log.trace({err: e}, 'error parsing URL');
                        return (callback(new BadRequestError(e.message)));
                }

                if (params === false)
                        continue;

                // Not common
                if (routes[i].type.length !== 0) {
                        switch (req.method) {
                        case 'POST':
                        case 'PUT':
                                // On uploads, check if the supplied
                                // content-type matches the type of the route
                                typed = routes[i].type.some(function (t) {
                                        var _ct = req.headers['content-type'] ||
                                                'application/octet-stream';
                                        return (matchContentType(t, _ct));
                                });
                                break;

                        default:
                                break;
                        }

                        if (typed === false)
                                continue;
                }

                if (routes[i].version.length === 0 ||
                    req.version === '*' ||
                    (ver = maxSatisfying(routes[i].version,
                                         req.getVersion()) || false)) {
                        r = routes[i];
                        break;
                }
        }

        //
        // In order, we check if the route exists, in which case, we're good.
        // Otherwise we look to see if ver was set to false; that would tell us
        // we indeed did find a matching route (method+url), but the version
        // field didn't line up, so we return bad version.  If no route and no
        // version, we now need to go walk the reverse map and look at whether
        // we should return 405 or 404.
        //

        if (params && r) {
                req.params = params || {};
                return (callback(null, r.name));
        }
        if (typed === false) {
                var ct = req.getContentType();
                return (callback(new UnsupportedMediaTypeError(ct)));
        }
        if (ver === false)
                return (callback(new InvalidVersionError(req.getVersion())));

        // Check for 405 instead of 404
        var urls = Object.keys(this.reverse);
        for (i = 0; i < urls.length; i++) {
                if (matchURL(new RegExp(urls[i]), req)) {
                        res.setHeader('Allow',
                                      this.reverse[urls[i]].slice().join(', '));
                        var err = new MethodNotAllowedError(req.method +
                                                            ' is not allowed');
                        return (callback(err));
                }
        }

        return (callback(new ResourceNotFoundError(req.url +
                                                   ' does not exist')));
};


Router.prototype.toString = function toString() {
        var self = this;
        var str = this.name + ':\n';

        Object.keys(this.routes).forEach(function (k) {
                var routes = self.routes[k].map(function (r) {
                        return (r.name);
                });

                str += '\t\t' + k + ': [' + routes.join(', ') + ']\n';
        });

        return (str);
};
