var async = require("async")
  , jsdom = require('jsdom')
  , specialElements = ["template","visible","text","html","css","style","attr"]
  , UglifyJS = require("uglifyjs")
  , _ = require("underscore")
  , uuid = require("node-uuid")
  , path = require('path')
;

module.exports = function(site,finish) {

  var api = {},
  templates = {},
  partials = {},
  basePage="",
  serverSideRendering = site.serverSideRendering;
  ;
  api.partials = partials;
  api.parseDataBinding = function(text) {
    var retVal = [],
      js;
    js = UglifyJS.parse("var data = { "+text+" };").body[0].
      definitions[0].value.properties;
    js.forEach(function(item) {
      var dataItem = {};
      dataItem.type = item.key;
      //handling the simple case
      if(_.contains(["visible","text","html","css","style","attr",
        "visiblePre","textPre","htmlPre","cssPre","stylePre","attrPre"
      ]
          ,dataItem.type)) {
        dataItem.dependencies = [item.value.name];
        dataItem.data = item.value.name;
      
      //handling the foreach loop
      } else if(dataItem.type === "foreach" ||
        dataItem.type === "template") {
        var singleValue = false;
        if(item.value.name) {
          singleValue = item.value.name;
        } else if(item.value.value) {
          singleValue = item.value.value;
        }
        if(singleValue) {
          
          dataItem.dependencies = [singleValue];
          if(dataItem.type === "foreach") {
            dataItem.data = [singleValue];
          } else {
            dataItem.name = singleValue;
          }
          
        } else if(item.value.properties) {
          item.value.properties.forEach(function(forItem) {
            var data;
            if(forItem.key === "data") {
              dataItem.dependencies = [forItem.value.name];
              dataItem.data = [forItem.value.name];
            } else if(forItem.key === "as") {
              dataItem.as = forItem.value.value;
            } else if(forItem.key === "name") {
              dataItem.name = forItem.value.value;
            } else if(forItem.key === "foreach") {
              dataItem.foreach = forItem.value.name;
              dataItem.dependencies = [dataItem.foreach];
            }
          });
        }
      }
      retVal.push(dataItem);
    });
    return retVal;
  };
  
  api.renderItem = function(item) {
    var dataBind = "";
    
    dataBind+=item.type+": ";
    if(item.type === "template" || item.type === "templatePre") {
      dataBind+="{";
      
      ["name","data","as","foreach"].forEach(function(dataItem) {
        if(item[dataItem]) {
          dataBind+=dataItem+": ";
          if(dataItem === "name" || dataItem === "as") {
            dataBind+="'";
          }
          dataBind+=item[dataItem];
          if(dataItem === "name" || dataItem === "as") {
            dataBind+="'";
          }
          dataBind+=" ,";
        }
      });
      
      dataBind+=" render:'yes' }";
    } else {
      dataBind += item.data;
    }
    return dataBind;
  }
  function prerender(window,root) {
    var children,
      rootBindings = []
      ;
    children =  root.children();
    if(children.size() > 0) {
      children.each(function(childId) {
        var items,
          child = window.$(children.get(childId)),
          scriptTag,
          bindings = [],
          rewrite = false,
          dataBind,
          script = false;
        if(child.attr("data-bind")) {
          items = api.parseDataBinding(child.attr("data-bind"));
          items.forEach(function(item) {
            var itemId
              ;
            
            if(item.type === "template") {
              if(templates[item.name].dependencies) {
                _.each(templates[item.name].dependencies, function(item){ 
                  bindings.push(item);
                });
              }
            }
            _.each(item.dependencies, function(item){ 
              bindings.push(item);
            });
            
          });
        
          _.each(prerender(window,child), function(item){ 
            bindings.push(item);
          });
          
          if(bindings.length > 0 ) {
            child.attr("data-dependency",bindings.join(","));
          }
        }
        _.each(bindings, function(item){ 
              rootBindings.push(item);
            });
      });
    }
    return rootBindings;
  }
  
  async.waterfall( [
    function(next) {
      jsdom.env({
        html:site.html,
        scripts:[
          path.join(__dirname, '..', 'public','components','jquery','jquery.min.js')
        ],
        FetchExternalResources:false,
        done:next
      });
    },
    function (window,next) {
      window.$("[data-bind]").toArray().forEach(function(itemIn) {
        var item = window.$(itemIn),
          dataItems = api.parseDataBinding(item.attr("data-bind")),
          rewrite = false,
          templateId;
        dataItems.forEach(function(bindItem) {
            
          if(bindItem.type === "foreach" || 
            bindItem.type == "template") {
            if(bindItem.type === "foreach") {
              bindItem.type = "template";
              bindItem.foreach = bindItem.data;
              delete bindItem.data;
              rewrite = true;
            }
            if(item.attr("data-templateId")) {
              templateId = item.attr("data-templateId");
            } else {
              templateId = uuid.v4();
            }
            if(item.children().size() > 0) {
              
              rewrite = true;
            
              templates[templateId] = { html:item.html() };
              if( !bindItem.name ) {
                bindItem.name = templateId;
              }
              item.children().detach();
            }
            if( !item.attr("data-templateId") ) {
              item.attr("data-templateId",templateId);
            }
            partials[templateId] = { template:bindItem.name  };
          }
        });
        if(rewrite) {
          dataBind = "";
          dataItems.forEach(function(bindItem) {
            if(dataBind !== "") {
              dataBind+=", ";
            }
              dataBind += api.renderItem(bindItem);
          });
          item.attr("data-bind",dataBind);
        }
        if(templateId) {
          partials[templateId].dataBind = item.attr("data-bind");
        }
      });
      
      window.$("script[type='text/html']").toArray().forEach(function(itemIn) {
        var item = window.$(itemIn);
        templates[item.attr("id")] = {html:item.html()};
        item.children().detach();
      });
      basePage = window.document.innerHTML;
      next();
    },
    function(callback) {
      var functions = [];
      _.each(templates, function(template) {
        if(!template.dependencies) {
          functions.push(
            function(next) {
              jsdom.env({
                html:template.html,
                scripts:[
                  path.join(__dirname, '..', 'public','components','jquery','jquery.min.js')
                ],
                FetchExternalResources:false,
                done:next
              });
            }
          );
          functions.push(
            function (window,next) {
              
              window.$("[data-bind]").toArray().forEach(function(itemIn) {
                var item = window.$(itemIn),
                  dataItems = api.parseDataBinding(item.attr("data-bind"));
                dataItems.forEach(function(bindItem) {
                  if(bindItem.dependencies) {
                    if(!template.dependencies) {
                      template.dependencies = [];
                    }
                    _.each(bindItem.dependencies, function(item){
                      template.dependencies.push(item);
                    });
                  }
                });
              });
              next();
            }
          );
        }
      });
      async.waterfall(functions,callback);
    },
  
    function(next) {
      jsdom.env({
        html:basePage,
        scripts:[
          path.join(__dirname, '..', 'public','components','jquery','jquery.min.js')
        ],
        FetchExternalResources:false,
        done:next
      });
    },
    function (window,next) {
      prerender(window,window.$("body"));
      basePage = window.document.innerHTML;
      window.$("[data-templateid]").toArray().forEach(function(itemIn) {
        var item = window.$(itemIn);
        if(item.attr("data-dependency")) {
          partials[item.attr("data-templateid")].dependencies = 
          item.attr("data-dependency").split(",");
        }
      });
      next();
    }
  ],finish);
  
  
  
  function addTemplates(window) {
    _.each(templates, function(value,key) {
      window.$("body").append(
        window.$("<script type=\"text/html\" id=\""+key+"\" >").
        html(value.html)
      );
    });
  }
  
  function addJavascript(window) {
    var scriptTag ="\n",
      model;
    window.$("script.jsdom").remove();
    scriptTag+="remoteKnockoutModel = function() {\n";
    scriptTag+="return "+JSON.stringify(site.data)+";\n";
    scriptTag+="};\n";
    scriptTag+="socketIONamespace = "+JSON.stringify(site.namespace)+" ;\n";
    
    model = window.$("<script class=\"remoteModel\" type=\"text/javascript\">");
    model.html(scriptTag);
    window.$("body").append(model);
    [
      "/socket.io/socket.io.js",
      "knockout.debug.js",
      "components/underscore/underscore-min.js",
      "components/jquery/jquery.min.js",
      "js/knockoutModel.js"
      
    ].
      forEach(function(script) {
        window.$("body").append(
          window.$("<script type=\"text/javascript\" src=\""+script+"\" >")
        );
    });
  }
  function postrender(window,root) {
    var parts,
      children;
    children =  root.children();
    if(children.size() > 0) {
      children.each(function(childId) {
        var child = window.$(children.get(childId)),
          items,
          dataBind;
        
        if(child.attr("data-bind")) {
          items = api.parseDataBinding(child.attr("data-bind"));
          items.forEach(function(item,key) {
            if(serverSideRendering && child.attr("data-templateId")) {
              delete items[key];
            } else {
              if(_.contains(specialElements,item.type) ) {
                item.type = item.type+"Pre";
              }
            }
          });
          dataBind = "";
          items.forEach(function(item) {
            if(dataBind !== "") {
              dataBind+=", ";
            }
            dataBind += api.renderItem(item);
          });
          child.attr("data-bind",dataBind);
        }
        postrender(window,child);
      });
    }
    
  }
  
  api.prerenderPage = function(done) {
    async.waterfall( [
      function(next) {
        jsdom.env({
          html:basePage,
          scripts:[
            path.join(__dirname, '..', 'public','knockout.js'),
            path.join(__dirname, '..', 'public','components','jquery','jquery.min.js')
          ],
          FetchExternalResources:false,
          done:next
        });
      },
      function (window,next) {
        addTemplates(window);
        window.$("body").attr("id","body");
        window.ko.renderTemplate(
          "body",
          site.data,
          {},
          window.$("body")[0]);
        if(serverSideRendering) {
          window.$("script[type='text/html']").remove();
        }
        addJavascript(window);
        postrender(window,window.$("body"));
        next(null,window.document.innerHTML);
      }
    ],done);
  };
  
  api.renderTemplate = function(templateId,model,done) {
    
    var partial = false;
    if(partials[templateId]) {
      partial = partials[templateId];
      async.waterfall( [
        function(next) {
          jsdom.env({
            html:"<html><body id=\"body\"><div id=\"template\"></div></body></html>",
            scripts:[
              path.join(__dirname, '..', 'public','knockout.js'),
              path.join(__dirname, '..', 'public','components','jquery','jquery.min.js')
            ],
            done:next
          });
        },
        function (window,next) {
          window.$("#template").attr("data-bind",partial.dataBind);
          addTemplates(window);
          window.ko.renderTemplate(
            "body",
            model,
            {},
            window.$("body")[0]);
          next(null,window.$("#template").html());
        }
      ],done);
    } else {
      done(new Error("could not find data"));
    }
  };
  
  
  return api;

};