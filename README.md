Promise-driven HTTP request wrapper with retry strategy
==============================

## Development

### Build image
    docker-compose build --no-cache

### Logon to container
    docker-compose run --rm node /bin/bash

### Run tests
    npm test

### Coding conventions
https://hapijs.com/styleguide

## Usage

### Example 1
```javascript
const RequestRetry = require('request-retry');
const Wreck = require('wreck'); // Or your HTTP client library of choice

(async () => {

    const yourRegularFunc = async () => {

        const options = { timeout: 1000 };
        return await Wreck.get('https://httpbin.org/delay/5', options);
    };

    const retry = new RequestRetry();
    retry.events.on('failedAttempt', (data) => console.log('Failed attempt: ' + data.attemptNumber));

    await retry.run(yourRegularFunc); // Makes 3 calls, then rejects with a timeout error
})();
```

### Example 2
```javascript
const RequestRetry = require('request-retry');
const Wreck = require('wreck'); // Or your HTTP client library of choice

(async () => {

    const yourRegularFunc = async () => {

        return await Wreck.get('https://httpbin.org/status/502');
    };

    const options = {
        numberOfRetries: 4,
        waitBetweenFirstRetryInMilliseconds: 2000
    };
    const retry = new RequestRetry(options);
    retry.events.on('failedAttempt', (data) => console.log('Failed attempt: ' + data.attemptNumber));

    await retry.run(yourRegularFunc); // Makes 5 calls, then rejects with a Bad Gateway error
})();
```
