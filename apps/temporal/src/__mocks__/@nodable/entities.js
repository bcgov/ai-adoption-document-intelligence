'use strict';

/**
 * CJS stub for @nodable/entities (ESM-only package).
 * Used only in Jest test environment to satisfy require() from @aws-sdk/xml-builder.
 */
class EntityDecoder {
  constructor(_options = {}) {}

  decode(str) {
    return str;
  }

  reset() {
    return this;
  }

  setExternalEntities(_map) {}

  addExternalEntity(_key, _value) {}

  addInputEntities(_map) {}

  setXmlVersion(_version) {}
}

module.exports = { EntityDecoder };
