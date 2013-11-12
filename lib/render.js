
/**
 * Module dependencies.
 */

var async = require("async")
  , express = require('express')
  , http = require('http')
  , path = require('path')
  , fs = require('fs')
  , Page = require("./page")
  , _ = require("underscore")
  ;
module.exports = function(site,finish) {
  var app = express(),
    page;
  if(site.src) {
    site.html = fs.readFileSync(site.src,"utf8");
  }
  app.configure(function(){
    app.use(express.favicon());
    app.use(express.logger('dev'));
    app.use(express.static(path.join(__dirname, '..', 'public')));
  });
  
  page = Page(site,finish);
  
  app.use('/', function(request,response,done) {
    async.waterfall( [
      page.prerenderPage,
      function(page,next) {
        response.send(page);
      }
    ]);
    
  });
  app.setupSocketIO = function(io) {
    
    io.of(site.namespace || "").on('connection', function (socket) {
      console.log("import data");
      var model = false;
      
      socket.emit("dataRequest", {});
      socket.on("importData", function (data) {
        model = data;
        console.log(data);
      });
      socket.on("updateValue", function(data) {
        console.log("update data",data);
        if(data.name) {
          model[data.name] = data.value;
        }
        if(site.serverSideRendering) {
          _.each(page.partials, function(partial,key) {
            if(partial.dependencies && 
              _.contains(partial.dependencies,data.name)) {
              async.waterfall( [
                page.renderTemplate.bind(undefined,key,model),
                function(templateHTML,next) {
                  console.log("update site",key,templateHTML);
                  socket.emit("update-site",{ templateId:key,
                    html:templateHTML
                  });
                }
              ]);
            }
            
          });
        }
        console.log(model);
      });
    });
  };
  return app;
};

var app = module.exports({src:path.join(__dirname,"..","test","spec","basic.html"),
  data:{template:"test template",items:["test3","test4"]},
  serverSideRendering:true
});
var server = require("doppio")({port:3000},app);
var io = require("socket.io").listen(server.server(),{ log: false });
app.setupSocketIO(io);
