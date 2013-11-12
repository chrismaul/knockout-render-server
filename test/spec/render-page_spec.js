var doppio = require("doppio")
  , async = require("async")
  , jsdom = require("jsdom")
  , render = require("../../lib/render")
  , expect = require("chai").expect
  , path = require("path")
  ;

describe('render the page', function () {

  ["client-side","server-side"].forEach(function(renderType) {
    describe(renderType, function() {
      var server;
      
      before(function(done) {
        var site = {src:path.join(__dirname,"basic.html"),
          data:{template:"test template",items:["test3","test4"]},
          serverSideRendering:renderType === "server-side"
        },
        app;
        
        var functions = [];
        if(server) {
          functions.push(server.stop);
        }
        functions.push(function(next) {
          app = render(site,next);
        });
        functions.push(function(next) {
          server = doppio({},app);
          server.start(next);
        });
        
        functions.push(function(next) {
          var io = require("socket.io").listen(server.server(),{ log: false });
          app.setupSocketIO(io);
          next();
        });

        async.waterfall(functions,done);
      });
      
      after(function(done) {
        if(server) {
          server.stop(done);
        } else {
          done();
        }
      });
      
      function loadSite(next) {
        jsdom.env({
          url:server.url(),
          scripts:[ '/components/jquery/jquery.min.js' ],
          features:{
            FetchExternalResources:["script"],
            ProcessExternalResources:["script"]
          },
          done:next
        });
      }
      
      it('should prerender the content', function (done) {
        async.waterfall(
          [
            loadSite,
            function(window,next) {
              var items = window.$(".data");
              expect(items.size()).to.equal(2);
              expect(window.$(items[0]).text()).to.equal("test3");
              expect(window.$(items[1]).text()).to.equal("test4");
              next();
            }
          ], done);
              
      });
      
      it('should prerender the templates', function (done) {
        async.waterfall(
          [
            loadSite,
            function(window,next) {
              window.$(".html").remove();
              expect(window.$(".test").text()).to.equal("test template");
              next();
            }
          ], done);
              
      });
      
      it('should have a model', function (done) {
        async.waterfall(
          [
            loadSite,
            function(window,next) {
              var script = window.$(".remoteModel").html();
              eval(script);
              var modelData = remoteKnockoutModel();
              expect(modelData.items).to.deep.equal(["test3","test4"]);
              next();
            }
          ], done);
              
      });
      
      it('should rerender the content', function (done) {
        async.waterfall(
          [
            loadSite,
            function(window,next) {
              var items = window.$(".data");
              expect(items.size()).to.equal(2);
              expect(window.$(items[0]).text()).to.equal("test3");
              expect(window.$(items[1]).text()).to.equal("test4");
              window.knockoutModel.items(["test5","test6"]);
              items = window.$(".data");
              expect(items.size()).to.equal(2);
              expect(window.$(items[0]).text()).to.equal("test5");
              expect(window.$(items[1]).text()).to.equal("test6");
              next();
            }
          ], done);
              
      });
      
      it('should prerender the templates', function (done) {
        async.waterfall(
          [
            loadSite,
            function(window,next) {
              expect(window.$(".test").text()).to.equal("test template");
              window.knockoutModel.template("test template 2");
              window.$(".html").remove();
              expect(window.$(".test").text()).to.equal("test template 2");
              next();
            }
          ], done);
              
      });
    });
  });
});