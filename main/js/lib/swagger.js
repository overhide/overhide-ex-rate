"use strict";

const path = require('path');
const jsyaml = require('js-yaml');
const swaggerJSDoc = require('swagger-jsdoc');

// private attribtues
const ctx = Symbol('context');

// private functions
const checkInit = Symbol('checkInit');

/**
 * Wires up functionality we use throughout.
 * 
 * Module returns this class as object all wired-up.  Before you can use the methods you must "init" the object 
 * somewhere at process start.
 * 
 * Leverages node's module system for a sort of context & dependency injection, so order of requiring and initializing
 * these sorts of libraries matters.
 */
class Swagger {
  constructor() {
    this[ctx] = null;
  }

  // ensure this is initialized
  [checkInit]() {
    if (!this[ctx]) throw new Error('library not initialized, call "init" when wiring up app first');
  }

  /**
   * Initialize this library: this must be the first method called somewhere from where you're doing context & dependency
   * injection.
   * 
   * @param {string} base_url - URI at which Swagger docs are being served
   * @param {string} swagger_endpoints_path - path to file with annotated endpoints for more API definitions
   * @param {string} uri
   * @returns {Swagger} this
   */
  init({ base_url, swagger_endpoints_path, uri } = {}) {
    if (base_url == null) throw new Error("URL must be specified.");
    if (swagger_endpoints_path == null) throw new Error("Swagger endpoints_path must be specified.");
    if (uri == null) throw new Error("URI must be specified.");

    this[ctx] = {
      base_url: base_url,
      path: swagger_endpoints_path,
      uri: uri
    };
    return this;
  }

  /**
   * @returns {string} rendered Swagger jsoon
   */
  render() {
    this[checkInit]();

    let yaml = `
      swaggerDefinition: 
        openapi: 3.0.1
        components:
          securitySchemes:
            bearerAuth:
              type: http
              scheme: bearer
              bearerFormat: uses https://token.overhide.io
        security:
          - bearerAuth: uses https://token.overhide.io
        host: ${this[ctx].base_url}
        basePath: /
        info:
          description: |          
            API to retrieve exchange rates between specified currencies and US dollars.

            This API is written in support of other APIs and widgets for [https://overhide.io](https://overhide.io) and the [ledgers.js](https://www.npmjs.com/package/ledgers.js) library.

            US dollars are the normalizing currency in *overhide*.

            These APIs require bearer tokens to be furnished in an 'Authorization' header as 'Bearer ..' values.  The tokens are to be retrieved from
            [https://token.overhide.io](https://token.overhide.io).
          version: 1.0.0
          title: overhide-ex-rate API
          contact:
            name: r/overhide (reddit)
            url: https://www.reddit.com/r/overhide/
          externalDocs:
            description: The main Web page.
            url: 'https://overhide.io'
        responses:
          400:
            description: |
              A bad request from the client.
          401:
            description: |
                These APIs require bearer tokens to be furnished in an 'Authorization' header as 'Bearer ..' values.  The tokens are to be retrieved from
                [https://token.overhide.io](https://token.overhide.io).
            headers:
              WWW_Authenticate:
                type: string
          403:
            description: Forbidden, your API key has been revoked.
          429:
            description: |
              Client is calling the API too frequently.
      apis: 
        - ${this[ctx].path}
    `;
    return swaggerJSDoc(jsyaml.safeLoad(yaml));
  }

}

module.exports = (new Swagger());