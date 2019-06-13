'use strict';

const Events = require('events');
const Hoek = require('@hapi/hoek');
const Joi = require('@hapi/joi');
const Retry = require('p-retry');

const internals = {};

internals.networkErrorCodes = [
    'ECONNRESET', // A connection was forcibly closed by a peer
    'ENOTFOUND',
    'ESOCKETTIMEDOUT',
    'ETIMEDOUT',
    'ECONNREFUSED',
    'EHOSTUNREACH', // The destination host cannot be reached (probably because the host is down or a remote router cannot reach it)
    'EPIPE', // The socket is shut down for writing, or the socket is connection-mode and is no longer connected
    'EAI_AGAIN' // A temporary failure in name resolution occurred
];

// https://en.wikipedia.org/wiki/List_of_HTTP_status_codes#5xx_Server_errors
internals.httpErrorCodes = [500, 501, 502, 503, 504, 505, 506, 507, 508, 510, 511];

internals.schemas = {
    constructor: Joi.object({
        numberOfRetries: Joi.number().integer().min(0).default(2),
        waitBetweenFirstRetryInMilliseconds: Joi.number().integer().min(0).default(1000),
        retryNetworkErrorCodes: Joi.array().items(Joi.string()).default(internals.networkErrorCodes),
        retryHttpErrorCodes: Joi.array().items(Joi.number().integer()).default(internals.httpErrorCodes)
    }).default()
};

exports = module.exports = internals.RequestRetry = class {

    constructor(options) {

        options = Joi.attempt(options, internals.schemas.constructor);

        this._numberOfRetries = options.numberOfRetries;
        this._waitBetweenFirstRetryInMilliseconds = options.waitBetweenFirstRetryInMilliseconds;
        this._retryNetworkErrorCodes = options.retryNetworkErrorCodes;
        this._retryHttpErrorCodes = options.retryHttpErrorCodes;
        this.events = new Events.EventEmitter();
    }

    _isNetworkOrHttpError(err) {

        if (!(err instanceof Error)) {
            return false;
        }

        if (this._retryNetworkErrorCodes.includes(err.code)) {
            return true;
        }

        // These properties support client libraries such as Axios, Request and Wreck
        const possibleProperties = ['code', 'statusCode', 'output.statusCode', 'response.status'];
        const isRetryableHttpError = possibleProperties.some((property) => {

            const code = Hoek.reach(err, property);
            return this._retryHttpErrorCodes.includes(code);
        });

        return isRetryableHttpError;
    }

    async run(requestFunc) {

        await Joi.validate(requestFunc, Joi.func().required());

        const wrapper = async () => {

            try {
                return await requestFunc();
            }
            catch (err) {
                if (this._isNetworkOrHttpError(err)) {
                    throw err; // Retry
                }

                throw new Retry.AbortError(err); // Don't retry
            }
        };

        const options = {
            retries: this._numberOfRetries,
            minTimeout: this._waitBetweenFirstRetryInMilliseconds,
            onFailedAttempt: (data) => this.events.emit('failedAttempt', data)
        };

        return await Retry(wrapper, options);
    }
};
