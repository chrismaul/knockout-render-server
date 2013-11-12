var doppio = require("doppio")
  , async = require("async")
  , jsdom = require("jsdom")
  , Page = require("../../lib/page")
  , expect = require("chai").expect
  , path = require("path")
  , fs = require("fs")
  ;

describe('partials', function () {
 
  var page,
    site,
    template = "317d3c46-ac3a-4f6c-a54a-66e6299cff12";
  before(function(done) {
    site = {html:fs.readFileSync(path.join(__dirname,"basic.html"),"utf8"),
      data:{template:"test template",items:["test3","test4"]}
    };
    page = Page(site,done);
  });
  
  function loadPartial(done) {
    async.waterfall(
      [
        page.renderTemplate.bind(undefined,template,site.data),
        function(html,next) {
          jsdom.env({
            html:html,
            scripts:[ 
              path.join(__dirname, '..', '..', 'public','components','jquery','jquery.min.js')
            ],
            done:next
          });
        }
      ], done);
  }
  
  it('should render the partial', function (done) {
    async.waterfall(
      [
        loadPartial,
        function(window,next) {
          var items = window.$(".data");
          expect(items.size()).to.equal(2);
          expect(window.$(items[0]).text()).to.equal("test3");
          expect(window.$(items[1]).text()).to.equal("test4");
          next();
        }
      ], done);
          
  });
});