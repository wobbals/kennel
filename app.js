var logger = require('morgan');
var bodyParser = require('body-parser');
var express = require('express');
var app = express();
var api = require('./api/index');
var config = require('config');
var kue = require('kue');
var debug = require('debug')('kennel:app');

// NB this must come after including index.js, which creates and configures
// the first call to kue.createQueue.
if (config.get("debug_queue")) {
  // optional: setup kue monitoring/debugging webapp
  debug("Kue admin listening on port 3001");
  kue.app.listen(3001);
}

app.use(logger('combined'));
app.use(bodyParser.json());
// app.use(bodyParser.urlencoded({ extended: false }));

app.use('/', api);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  var err = new Error('Not Found');
  err.status = 404;
  next(err);
});

// error handlers

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
  app.use(function(err, req, res, next) {
    res.status(err.status || 500);
    res.json({
      message: err.message,
      error: err
    });
  });
}

// production error handler
// no stacktraces leaked to user
app.use(function(err, req, res, next) {
  res.status(err.status || 500);
  res.json({
    error: err.message
  });
});


module.exports = app;
