'use strict'

const Instance = require('../../model/instanceModel');
const chai = require('chai');
const expect = chai.expect;
const chaiAsPromised = require("chai-as-promised");
chai.use(chaiAsPromised);
chai.should();

const uuid = require('uuid/v4');
let dummyInstanceId = uuid();
let dummyTaskId = uuid();

describe('Instance model', () => {
  console.log(`using instance id ${dummyInstanceId}`);
  describe('getInstance', () => {
    it('should export a function', () => {
      return Instance.getInstance.should.be.a('function')
    });
    it('should not find unknown data', () => {
      return Instance.getInstance(dummyInstanceId)
      .should.become(null);
    });
  });
  describe('registerInstance', () => {
    it('should export a function', () => {
      return Instance.registerInstance.should.be.a('function')
    });
    it('should register an instance', () => {
      return Instance.registerInstance(dummyInstanceId)
      .should.eventually.include('OK');
    });
    it('should find registered instance', () => {
      return Instance.getInstance(dummyInstanceId)
      .should.eventually.have.property('createdAt');
    });
    it('should register instance as pending', () => {
      return Instance.getPendingInstances()
      .should.eventually.include(dummyInstanceId);
    });
  });
  describe('setIdleSince', () => {
    it('should work when invoked', () => {
      let now = new Date();
      return Instance.setIdleSince(dummyInstanceId, now)
      .should.become(1);
    });
    it('should fetch idleSince correctly', () => {
      return Instance.getInstance(dummyInstanceId)
      .should.eventually.have.property('idleSince');
    });
  });
  describe('task registration', () => {
    it('should register a task', () => {
      return Instance.registerInstanceTaskStarted(dummyInstanceId, dummyTaskId)
      .should.be.fulfilled;
    });
    it('should find registered task', () => {
      return Instance.getInstanceTasks(dummyInstanceId)
      .should.become([dummyTaskId])
    });
    it('should not find idleSince after new task registered', () => {
      return Instance.getInstance(dummyInstanceId)
      .should.not.eventually.have.property('idleSince');
    });
  });
});