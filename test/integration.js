'use strict';

const Code = require('code');
const Hoek = require('hoek');
const Lab = require('lab');
const RequestRetry = require('..');
const Wreck = require('wreck');

const { describe, it } = exports.lab = Lab.script();
const expect = Code.expect;

describe('RequestRetry', { timeout: 10000, skip: true }, () => {

    it('retries if error is a timeout', async () => {

        let callCount = 0;
        let retryCount = 0;
        const timer = new Hoek.Bench();

        const retry = new RequestRetry();
        retry.events.on('retry', () => retryCount++);

        const fn = async () => {

            callCount++;
            const options = { timeout: 1000 };
            await Wreck.get('https://httpbin.org/delay/5', options);
        };

        const error = await expect(retry.run(fn)).to.reject(Error);
        expect(error.message).to.equal('Client request timeout');
        expect(error.output.statusCode).to.equal(504);
        expect(callCount).to.equal(3);
        expect(retryCount).to.equal(2);
        expect(timer.elapsed()).to.be.at.least(3000);
    });

    it('retries if error is a ECONNREFUSED', async () => {

        let callCount = 0;
        let retryCount = 0;
        const timer = new Hoek.Bench();

        const retry = new RequestRetry();
        retry.events.on('retry', () => retryCount++);

        const fn = async () => {

            callCount++;
            await Wreck.get('192.168.255.255'); // Non-routable
        };

        const error = await expect(retry.run(fn)).to.reject(Error);
        expect(error.message).to.equal('Client request error: connect ECONNREFUSED 127.0.0.1:80');
        expect(error.output.statusCode).to.equal(502);
        expect(callCount).to.equal(3);
        expect(retryCount).to.equal(2);
        expect(timer.elapsed()).to.be.at.least(3000);
    });

    it('retries if error is a ENOTFOUND', async () => {

        let callCount = 0;
        let retryCount = 0;
        const timer = new Hoek.Bench();

        const retry = new RequestRetry();
        retry.events.on('retry', () => retryCount++);

        const fn = async () => {

            callCount++;
            await Wreck.get('http://thisdomaindoesnotexist.nl/');
        };

        const error = await expect(retry.run(fn)).to.reject(Error);
        expect(error.message).to.equal('Client request error: getaddrinfo ENOTFOUND thisdomaindoesnotexist.nl thisdomaindoesnotexist.nl:80');
        expect(error.output.statusCode).to.equal(502);
        expect(callCount).to.equal(3);
        expect(retryCount).to.equal(2);
        expect(timer.elapsed()).to.be.at.least(3000);
    });
});
