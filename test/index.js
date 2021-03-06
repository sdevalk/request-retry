'use strict';

const Axios = require('axios');
const Boom = require('@hapi/boom');
const Code = require('@hapi/code');
const Hoek = require('@hapi/hoek');
const Http = require('http');
const Https = require('https');
const Lab = require('@hapi/lab');
const Request = require('request-promise-native');
const RequestRetry = require('..');
const Wreck = require('@hapi/wreck');

const internals = {};
const { describe, it } = exports.lab = Lab.script();
const expect = Code.expect;

describe('RequestRetry', { timeout: 10000 }, () => {

    describe('constructor', () => {

        const badConstructor = (provider) => {

            it('throws error if bad options are given', () => {

                const fn = () => {

                    new RequestRetry(provider.options);
                };

                expect(fn).to.throw(new RegExp(provider.expectedMessage));
            });
        };

        badConstructor({
            options: null,
            expectedMessage: '"value" must be an object'
        });

        badConstructor({
            options: {
                numberOfRetries: null
            },
            expectedMessage: '"numberOfRetries" must be a number'
        });

        badConstructor({
            options: {
                numberOfRetries: 1.2
            },
            expectedMessage: '"numberOfRetries" must be an integer'
        });

        badConstructor({
            options: {
                numberOfRetries: -1
            },
            expectedMessage: '"numberOfRetries" must be larger than or equal to 0'
        });

        badConstructor({
            options: {
                waitBetweenFirstRetryInMilliseconds: null
            },
            expectedMessage: '"waitBetweenFirstRetryInMilliseconds" must be a number'
        });

        badConstructor({
            options: {
                waitBetweenFirstRetryInMilliseconds: 1.2
            },
            expectedMessage: '"waitBetweenFirstRetryInMilliseconds" must be an integer'
        });

        badConstructor({
            options: {
                waitBetweenFirstRetryInMilliseconds: -1
            },
            expectedMessage: '"waitBetweenFirstRetryInMilliseconds" must be larger than or equal to 0'
        });

        badConstructor({
            options: {
                retryNetworkErrorCodes: null
            },
            expectedMessage: '"retryNetworkErrorCodes" must be an array'
        });

        badConstructor({
            options: {
                retryNetworkErrorCodes: [null]
            },
            expectedMessage: '"0" must be a string'
        });

        badConstructor({
            options: {
                retryHttpErrorCodes: null
            },
            expectedMessage: '"retryHttpErrorCodes" must be an array'
        });

        badConstructor({
            options: {
                retryHttpErrorCodes: [null]
            },
            expectedMessage: '"0" must be a number'
        });

        badConstructor({
            options: {
                retryHttpErrorCodes: [1.2]
            },
            expectedMessage: '"0" must be an integer'
        });
    });

    describe('run', () => {

        it('rejects if argument is not a function', async () => {

            const retry = new RequestRetry();

            const error = await expect(retry.run(null)).to.reject();
            expect(error.name).to.equal('ValidationError');
            expect(error.message).to.equal('"value" must be a Function');
        });

        it('does not retry if number of retries is 0', async () => {

            let failedAttemptCount = 0;

            const options = { numberOfRetries: 0 };
            const retry = new RequestRetry(options);
            retry.events.on('failedAttempt', () => failedAttemptCount++);

            const fn = () => {

                throw Boom.badImplementation();
            };

            await expect(retry.run(fn)).to.reject();
            expect(failedAttemptCount).to.equal(1);
        });

        it('does not retry if error is not a real error', async () => {

            let failedAttemptCount = 0;

            const retry = new RequestRetry();
            retry.events.on('failedAttempt', () => failedAttemptCount++);

            const fn = () => {

                throw { a: 'b' };
            };

            await expect(retry.run(fn)).to.reject();
            expect(failedAttemptCount).to.equal(0);
        });

        it('does not retry if error is not a network or HTTP error', async () => {

            let failedAttemptCount = 0;

            const retry = new RequestRetry();
            retry.events.on('failedAttempt', () => failedAttemptCount++);

            const fn = () => {

                throw new Error('Bad');
            };

            await expect(retry.run(fn)).to.reject(Error, 'Bad');
            expect(failedAttemptCount).to.equal(0);
        });

        it('retries default times with default wait', async () => {

            let failedAttemptCount = 0;
            const timer = new Hoek.Bench();

            const retry = new RequestRetry();
            retry.events.on('failedAttempt', () => failedAttemptCount++);

            const fn = () => {

                throw Boom.badImplementation();
            };

            await expect(retry.run(fn)).to.reject(Error);
            expect(failedAttemptCount).to.equal(3);
            expect(timer.elapsed()).to.be.between(3000, 4000);
        });

        it('retries custom times with default wait', async () => {

            let failedAttemptCount = 0;
            const timer = new Hoek.Bench();

            const options = { numberOfRetries: 3 };
            const retry = new RequestRetry(options);
            retry.events.on('failedAttempt', () => failedAttemptCount++);

            const fn = () => {

                throw Boom.badImplementation();
            };

            await expect(retry.run(fn)).to.reject(Error);
            expect(failedAttemptCount).to.equal(4);
            expect(timer.elapsed()).to.be.between(7000, 8000);
        });

        it('retries default times with custom wait', async () => {

            let failedAttemptCount = 0;
            const timer = new Hoek.Bench();

            const options = { waitBetweenFirstRetryInMilliseconds: 100 };
            const retry = new RequestRetry(options);
            retry.events.on('failedAttempt', () => failedAttemptCount++);

            const fn = () => {

                throw Boom.badImplementation();
            };

            await expect(retry.run(fn)).to.reject(Error);
            expect(failedAttemptCount).to.equal(3);
            expect(timer.elapsed()).to.be.between(300, 400);
        });

        it('retries custom times with custom wait', async () => {

            let failedAttemptCount = 0;
            const timer = new Hoek.Bench();

            const options = { numberOfRetries: 1, waitBetweenFirstRetryInMilliseconds: 50 };
            const retry = new RequestRetry(options);
            retry.events.on('failedAttempt', () => failedAttemptCount++);

            const fn = () => {

                throw Boom.badImplementation();
            };

            await expect(retry.run(fn)).to.reject(Error);
            expect(failedAttemptCount).to.equal(2);
            expect(timer.elapsed()).to.be.between(50, 60);
        });

        it('retries with custom network error code', async () => {

            let failedAttemptCount = 0;
            const timer = new Hoek.Bench();

            const options = { retryNetworkErrorCodes: ['EPROTO'] };
            const retry = new RequestRetry(options);
            retry.events.on('failedAttempt', () => failedAttemptCount++);

            const handler = (request, response) => {

                response.writeHead(200);
                response.end();
            };

            const server = await internals.getServer(handler);

            const fn = () => {

                const reqOptions = {
                    protocol: 'https:',
                    port: server.address().port,
                    hostname: 'localhost'
                };

                return new Promise((resolve, reject) => {

                    const request = Https.request(reqOptions);
                    request.on('error', (err) => reject(err));
                    request.once('response', resolve);
                    request.end();
                });
            };

            const error = await expect(retry.run(fn)).to.reject(Error);
            expect(error.code).to.equal('EPROTO');
            expect(failedAttemptCount).to.equal(3);
            expect(timer.elapsed()).to.be.between(3000, 4000);

            server.close();
        });

        it('retries with custom HTTP error code', async () => {

            let failedAttemptCount = 0;
            const timer = new Hoek.Bench();

            const options = { retryHttpErrorCodes: [400] };
            const retry = new RequestRetry(options);
            retry.events.on('failedAttempt', () => failedAttemptCount++);

            const handler = (request, response) => {

                response.writeHead(400);
                response.end();
            };

            const server = await internals.getServer(handler);

            const fn = async () => {

                const baseUrl = 'http://localhost:' + server.address().port;
                await Wreck.get(baseUrl);
            };

            const error = await expect(retry.run(fn)).to.reject(Error);
            expect(error.output.statusCode).to.equal(400);
            expect(failedAttemptCount).to.equal(3);
            expect(timer.elapsed()).to.be.between(3000, 4000);

            server.close();
        });

        describe('error response properties', () => {

            it('retries if error is HTTP error with property "code"', async () => {

                let failedAttemptCount = 0;
                const timer = new Hoek.Bench();

                const retry = new RequestRetry();
                retry.events.on('failedAttempt', () => failedAttemptCount++);

                const handler = (request, response) => {

                    response.writeHead(500);
                    response.end();
                };

                const server = await internals.getServer(handler);

                const fn = () => {

                    const reqOptions = {
                        port: server.address().port,
                        hostname: 'localhost'
                    };

                    return new Promise((resolve, reject) => {

                        const request = Http.request(reqOptions);
                        request.on('error', (err) => reject(err));
                        request.once('response', (response) => {

                            const error = new Error();
                            error.code = response.statusCode;
                            request.emit('error', error);
                        });
                        request.end();
                    });
                };

                const error = await expect(retry.run(fn)).to.reject(Error);
                expect(error.code).to.equal(500);
                expect(failedAttemptCount).to.equal(3);
                expect(timer.elapsed()).to.be.between(3000, 4000);

                server.close();
            });

            it('retries if error is HTTP error with property "statusCode"', async () => {

                let failedAttemptCount = 0;
                const timer = new Hoek.Bench();

                const retry = new RequestRetry();
                retry.events.on('failedAttempt', () => failedAttemptCount++);

                const handler = (request, response) => {

                    response.writeHead(500);
                    response.end();
                };

                const server = await internals.getServer(handler);

                const fn = async () => {

                    const baseUrl = 'http://localhost:' + server.address().port;
                    await Request(baseUrl);
                };

                const error = await expect(retry.run(fn)).to.reject(Error);
                expect(error.statusCode).to.equal(500);
                expect(failedAttemptCount).to.equal(3);
                expect(timer.elapsed()).to.be.between(3000, 4000);

                server.close();
            });

            it('retries if error is HTTP error with property "output.statusCode"', async () => {

                let failedAttemptCount = 0;
                const timer = new Hoek.Bench();

                const retry = new RequestRetry();
                retry.events.on('failedAttempt', () => failedAttemptCount++);

                const handler = (request, response) => {

                    response.writeHead(500);
                    response.end();
                };

                const server = await internals.getServer(handler);

                const fn = async () => {

                    const baseUrl = 'http://localhost:' + server.address().port;
                    await Wreck.get(baseUrl);
                };

                const error = await expect(retry.run(fn)).to.reject(Error);
                expect(error.output.statusCode).to.equal(500);
                expect(failedAttemptCount).to.equal(3);
                expect(timer.elapsed()).to.be.between(3000, 4000);

                server.close();
            });

            it('retries if error is HTTP error with property "response.status"', async () => {

                let failedAttemptCount = 0;
                const timer = new Hoek.Bench();

                const retry = new RequestRetry();
                retry.events.on('failedAttempt', () => failedAttemptCount++);

                const handler = (request, response) => {

                    response.writeHead(500);
                    response.end();
                };

                const server = await internals.getServer(handler);

                const fn = async () => {

                    const baseUrl = 'http://localhost:' + server.address().port;
                    await Axios.get(baseUrl);
                };

                const error = await expect(retry.run(fn)).to.reject(Error);
                expect(error.response.status).to.equal(500);
                expect(failedAttemptCount).to.equal(3);
                expect(timer.elapsed()).to.be.between(3000, 4000);

                server.close();
            });
        });

        describe('network errors', () => {

            it('retries if error is a ECONNRESET', async () => {

                let failedAttemptCount = 0;
                const timer = new Hoek.Bench();

                const retry = new RequestRetry();
                retry.events.on('failedAttempt', () => failedAttemptCount++);

                const handler = (request, response) => {

                    request.destroy();
                };

                const server = await internals.getServer(handler);

                const fn = async () => {

                    const reqOptions = {
                        port: server.address().port,
                        hostname: 'localhost'
                    };

                    await internals.makeRequest(reqOptions);
                };

                const error = await expect(retry.run(fn)).to.reject(Error);
                expect(error.code).to.equal('ECONNRESET');
                expect(failedAttemptCount).to.equal(3);
                expect(timer.elapsed()).to.be.between(3000, 4000);

                server.close();
            });

            it('retries if error is a ECONNREFUSED', async () => {

                let failedAttemptCount = 0;
                const timer = new Hoek.Bench();

                const retry = new RequestRetry();
                retry.events.on('failedAttempt', () => failedAttemptCount++);

                const server = await internals.getServer(() => {});
                const unknownPort = server.address().port + 1;

                const fn = async () => {

                    const reqOptions = {
                        port: unknownPort,
                        hostname: 'localhost'
                    };

                    await internals.makeRequest(reqOptions);
                };

                const error = await expect(retry.run(fn)).to.reject(Error);
                expect(error.code).to.equal('ECONNREFUSED');
                expect(failedAttemptCount).to.equal(3);
                expect(timer.elapsed()).to.be.between(3000, 4000);

                server.close();
            });

            it('retries if error is a ENOTFOUND', async () => {

                let failedAttemptCount = 0;
                const timer = new Hoek.Bench();

                const retry = new RequestRetry();
                retry.events.on('failedAttempt', () => failedAttemptCount++);

                const server = await internals.getServer(() => {});

                const fn = async () => {

                    const reqOptions = {
                        port: server.address().port,
                        hostname: 'unknownHost'
                    };

                    await internals.makeRequest(reqOptions);
                };

                const error = await expect(retry.run(fn)).to.reject(Error);
                expect(error.code).to.equal('ENOTFOUND');
                expect(failedAttemptCount).to.equal(3);
                expect(timer.elapsed()).to.be.between(3000, 4000);

                server.close();
            });

            it('retries if error is a ESOCKETTIMEDOUT', async () => {

                let failedAttemptCount = 0;
                const timer = new Hoek.Bench();

                const retry = new RequestRetry();
                retry.events.on('failedAttempt', () => failedAttemptCount++);

                const server = await internals.getServer(() => {});

                const fn = () => {

                    const reqOptions = {
                        port: server.address().port,
                        hostname: 'localhost'
                    };

                    return new Promise((resolve, reject) => {

                        const request = Http.request(reqOptions);
                        request.on('error', (err) => reject(err));
                        request.once('response', resolve);
                        request.end();
                        request.on('socket', () => {

                            const error = new Error('ESOCKETTIMEDOUT');
                            error.code = 'ESOCKETTIMEDOUT';
                            request.emit('error', error);
                        });
                    });
                };

                const error = await expect(retry.run(fn)).to.reject(Error);
                expect(error.code).to.equal('ESOCKETTIMEDOUT');
                expect(failedAttemptCount).to.equal(3);
                expect(timer.elapsed()).to.be.between(3000, 4000);

                server.close();
            });

            it('retries if error is a ETIMEDOUT', async () => {

                let failedAttemptCount = 0;
                const timer = new Hoek.Bench();

                const retry = new RequestRetry();
                retry.events.on('failedAttempt', () => failedAttemptCount++);

                const handler = (request, response) => {

                    setTimeout(() => response.end(), 5000); // Force server to *not* respond in time
                };

                const server = await internals.getServer(handler);

                const fn = () => {

                    const reqOptions = {
                        port: server.address().port,
                        hostname: 'localhost'
                    };

                    return new Promise((resolve, reject) => {

                        const request = Http.request(reqOptions);
                        request.on('error', (err) => reject(err));
                        request.once('response', resolve);
                        request.end();
                        request.setTimeout(1000);
                        request.on('timeout', () => {

                            const error = new Error('ETIMEDOUT');
                            error.code = 'ETIMEDOUT';
                            request.emit('error', error);
                        });
                    });
                };

                const error = await expect(retry.run(fn)).to.reject(Error);
                expect(error.code).to.equal('ETIMEDOUT');
                expect(failedAttemptCount).to.equal(3);
                expect(timer.elapsed()).to.be.between(6000, 7000);

                server.close();
            });
        });

        describe('HTTP errors', () => {

            const errorInDefaultRange = (provider) => {

                it('retries default times if error is HTTP error in default range', async () => {

                    let failedAttemptCount = 0;
                    const timer = new Hoek.Bench();

                    const retry = new RequestRetry();
                    retry.events.on('failedAttempt', () => failedAttemptCount++);

                    const handler = (request, response) => {

                        response.writeHead(provider.errorCode);
                        response.end();
                    };

                    const server = await internals.getServer(handler);

                    const fn = async () => {

                        const baseUrl = 'http://localhost:' + server.address().port;
                        await Wreck.get(baseUrl);
                    };

                    const error = await expect(retry.run(fn)).to.reject(Error);
                    expect(error.output.statusCode).to.equal(provider.errorCode);
                    expect(failedAttemptCount).to.equal(3);
                    expect(timer.elapsed()).to.be.between(3000, 4000);

                    server.close();
                });
            };

            errorInDefaultRange({ errorCode: 500 });
            errorInDefaultRange({ errorCode: 501 });
            errorInDefaultRange({ errorCode: 502 });
            errorInDefaultRange({ errorCode: 503 });
            errorInDefaultRange({ errorCode: 504 });
            errorInDefaultRange({ errorCode: 505 });
            errorInDefaultRange({ errorCode: 506 });
            errorInDefaultRange({ errorCode: 507 });
            errorInDefaultRange({ errorCode: 508 });
            errorInDefaultRange({ errorCode: 510 });
            errorInDefaultRange({ errorCode: 511 });

            const errorNotInDefaultRange = (provider) => {

                it('does not retry if error is HTTP error not in default range', async () => {

                    let failedAttemptCount = 0;
                    const timer = new Hoek.Bench();

                    const retry = new RequestRetry();
                    retry.events.on('failedAttempt', () => failedAttemptCount++);

                    const handler = (request, response) => {

                        response.writeHead(provider.errorCode);
                        response.end();
                    };

                    const server = await internals.getServer(handler);

                    const fn = async () => {

                        const baseUrl = 'http://localhost:' + server.address().port;
                        await Wreck.get(baseUrl);
                    };

                    const error = await expect(retry.run(fn)).to.reject(Error);
                    expect(error.output.statusCode).to.equal(provider.errorCode);
                    expect(failedAttemptCount).to.equal(0);
                    expect(timer.elapsed()).to.be.below(100);

                    server.close();
                });
            };

            errorNotInDefaultRange({ errorCode: 400 });
            errorNotInDefaultRange({ errorCode: 499 });
            errorNotInDefaultRange({ errorCode: 509 });
            errorNotInDefaultRange({ errorCode: 512 });
        });

        it('retries and returns data on retry event', async () => {

            let failedAttemptCount = 0;
            const timer = new Hoek.Bench();

            const retry = new RequestRetry();
            retry.events.on('failedAttempt', (data) => {

                failedAttemptCount++;
                expect(data.attemptNumber).to.equal(failedAttemptCount);
                expect(data.retriesLeft).to.equal(3 - failedAttemptCount);
            });

            const fn = () => {

                throw Boom.badImplementation();
            };

            await expect(retry.run(fn)).to.reject(Error);
            expect(failedAttemptCount).to.equal(3);
            expect(timer.elapsed()).to.be.between(3000, 4000);
        });
    });
});

internals.getServer = function (handler) {

    const server = Http.createServer(handler);

    return new Promise((resolve) => {

        server.listen(0, () => resolve(server));
    });
};

internals.makeRequest = function (options) {

    const reqOptions = {
        port: options.port,
        hostname: options.hostname
    };

    return new Promise((resolve, reject) => {

        const request = Http.request(reqOptions);
        request.on('error', (err) => reject(err));
        request.once('response', resolve);
        request.end();
    });
};
