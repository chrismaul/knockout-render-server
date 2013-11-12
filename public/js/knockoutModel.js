["template","visible","text",
  "html","css","style","attr"].forEach(function(item) {
  ko.bindingHandlers[item+"Pre"] = {
    'init': function(element, valueAccessor, allBindings, viewModel, bindingContext) {
      console.log("init");
      element.setAttribute("data-render","false");
      ko.utils.unwrapObservable(valueAccessor());
      if(ko.bindingHandlers[item]['init']) {
        return ko.bindingHandlers[item]['init'](element, valueAccessor, allBindings, viewModel, bindingContext);
      }
      
    },
    'update': function(element, valueAccessor, allBindings, viewModel, bindingContext) {
      console.log("update");
      ko.utils.unwrapObservable(valueAccessor());
      if(element.getAttribute("data-dependency")) {
        console.log("dependency");
        element.getAttribute("data-dependency").split(",").forEach(function(item) {
          console.log(item);
          ko.utils.unwrapObservable(knockoutModel[item]);
        });
      }
      if(element.getAttribute("data-render") === "false" ) {
        
        element.removeAttribute("data-render");
      } else {
        console.log("rerender");
        ko.virtualElements.emptyNode(element);
        
        return ko.bindingHandlers[item]['update'](element, valueAccessor, allBindings, viewModel, bindingContext);
      }
    }
  }

});
(function() {
var root = this;
var knockoutModelGenerator = function() {
  var remoteModel = remoteKnockoutModel(),
    retVal = {};
  _.each(remoteModel, function(value,key) {
    if(_.isArray(value)) {
      retVal[key] = ko.observableArray(value);
    } else if(_.isFunction(value)) {
      retVal[key] = value;
    } else {
      retVal[key] = ko.observable(value);
    }
  });
  if(typeof(localModel) !== "undefined") {
    if(_.isFunction(localModel)) {
      retVal = localModel(retVal);
    } else if(_.isObject(localModel)) {
      retVal = _.extend(retVal,localModel);
    }
  }
  return retVal;
};
root.knockoutModel = knockoutModelGenerator();
ko.applyBindings(root.knockoutModel);
var socket = io.connect(socketIONamespace);

  socket.on('update-site', function (data) {
    $("[data-templateid='"+data.templateId+"']").html(data.html);
  });

  socket.on('dataRequest', function (data) {
    var retVal = {};
    _.each(root.knockoutModel, function(value,key) {
      retVal[key] = value();
    });
    socket.emit("importData", retVal);
  });
  _.each(root.knockoutModel, function(value,key) {
      value.subscribe(function(newValue) {
        socket.emit("updateValue",{name:key,value:newValue});
    });
});
document.body.addEventListener("click",console.log);
}).call(this);