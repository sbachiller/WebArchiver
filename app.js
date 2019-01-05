
require('events').EventEmitter.prototype._maxListeners = 100;

var http = require('http');
var request = require('request');
var cheerio = require ('cheerio');
var stream = require('stream');
var fs = require('fs');
var path = require('path');
var url = require('url');
var archiver = require('archiver');

function URLManager(){
//todos los métodos son static
}

URLManager.getResourceExtension = function(u){
  var pathname = url.parse(u).pathname;
  var ext = path.parse(pathname).ext;
  
  if (ext == ""){
    ext = ".html";
  }
  
  return ext;
};

URLManager.getDownloadableURL = function(urlParent, href){
  if (href != undefined){
    return url.resolve(urlParent,href);
  } else {
    return urlParent;
  }
  
};

function replaceManager(mf){
  this.maxFiles = mf;
  this.counter = 1;
  this.replaceMap = [];
  this._NOT_FOUND_FILE = "404.html";

  this.getIndex = function(){
    var self = this;
    return self.counter++;
  };

  this.lookupName = function(url){
    var self = this;
    if (url in self.replaceMap){
      return self.replaceMap[url];
    }else{
      if(self.counter - 1 < self.maxFiles){
        self.replaceMap[url] = self.getIndex() + URLManager.getResourceExtension(url);
        return self.replaceMap[url];
      }else{
        //self.replaceMap[url] = replaceManager._NOT_FOUND_FILE;
        return self._NOT_FOUND_FILE;   
      }
    }
  };
}
replaceManager._NOT_FOUND_FILE = "404.html"; 

function getTransformStream(url, recLevel, replaceManager, downloadedFiles, doCrawlAndDownloadResource) {
  var transformStream = new stream.Transform();
  var buffer='';

  transformStream._transform = function(chunk, encoding, callback) {    
    buffer += chunk.toString();
    callback();
  };

  transformStream._flush = function(callback){
    this.push(transformStream._replace(buffer));
    callback();
  };

  transformStream._replace = function(chunk){
      $ = cheerio.load(chunk);
      $('a').each(function (i, link){
        var newUrl = $(this).attr('href'); 
        var newUrlName = replaceManager.lookupName(newUrl);
        $(this).attr('href', newUrlName);

        doCrawlAndDownloadResource(
          URLManager.getDownloadableURL(url, newUrl),
          recLevel - 1, replaceManager, newUrlName, downloadedFiles); 
      }); //end $a.each
      return $.html();
  }; 

  return transformStream;  
}

function startCrawling(req, res, queryReq){
  var query = queryReq.query;
  var uri = query.uri;
  var recLevel = query.reclevel;
  var maxfiles = query.maxfiles;

  var repManager = new replaceManager(maxfiles);
  var alreadyDownloaded = [];

  var archive = archiver('zip');

  var finishedFluxes = 0;
  var startedFluxes = 0;

  //Concatenar el flujo de archive a la respuesta
  archive.pipe(res);

  console.log("Trying to download " + uri + " with " + recLevel + " levels. Maximum " + maxfiles + " files\n");
  
  function doCrawlAndDownloadResource(url, recLevel, replaceManager, outputName, downloadedFiles){

    if (alreadyDownloaded.indexOf(url) == -1 && outputName != "404.html" && recLevel > 0 && alreadyDownloaded.length < maxfiles){
        if(alreadyDownloaded.length < maxfiles){
          console.log("Attempting to download " + url + " as " + outputName);
    
          alreadyDownloaded.push(url);
          startedFluxes++;
    
          console.log("Started " + startedFluxes + " fluxes");
          
          var stream = request.get(url);
          var transformStr = getTransformStream(url,recLevel,repManager,alreadyDownloaded, doCrawlAndDownloadResource);
          
          //InputStream to TransformStream
          stream.pipe(transformStr);
      
          //Hacer una entrada index.html
          archive.append(transformStr, { name: outputName});
        
          //Cerrar la peticion cuando se acabe la transferencia
          archive.on('end', function() {
            console.log('Downloaded %d bytes from %s', archive.pointer(), url);
          });
          
          //Se cierra cuando se acaben todos los flujos
          //Cerrar el archive
          
          transformStr.on("finish",() =>{
            finishedFluxes++;
            console.log("Ended " + finishedFluxes + " fluxes\n\n");
            if (finishedFluxes == startedFluxes){
              archive.finalize();
            }
          });
        }
      }
    }

  doCrawlAndDownloadResource(uri,recLevel,repManager,"index.html",alreadyDownloaded);


}


function routeRequests(req, res){

  //Load index.html
  if (req.url == "/"){
    fs.readFile("view/index.html",function(err,data){
      if(err){
        res.writeHead(404, {"Content-Type": "text/html"});
        res.end("404 Not Found");
      }else{
        res.writeHead(200, {"Content-Type": "text/html"});
        res.write(data);
        res.end();
      }
    });
  }

  //Load crawler
  if (url.parse(req.url).pathname == "/crawler"){
    var queryReq = url.parse(req.url, true);
    res.writeHead(200, {
      'Content-Type': 'application/zip',
      'Content-disposition': 'attachment; filename=downloaded_files.zip'
    });
    startCrawling(req,res,queryReq);
  }

  //Load CSS - Bootstrap
  if (req.url == "/resources/css/bootstrap.css"){
    fs.readFile("resources/css/bootstrap.css",function(err,data){
      if(err){
        res.writeHead(404, {"Content-Type": "text/css"});
        res.end("404 Not Found");
      }else{
        res.writeHead(200, {"Content-Type": "text/css"});
        res.write(data);
        res.end();
      }
    });
  }

  //Load CSS - MyStyle
  if (req.url == "/resources/css/myStyle.css"){
    fs.readFile("resources/css/myStyle.css",function(err,data){
      if(err){
        res.writeHead(404, {"Content-Type": "text/css"});
        res.end("404 Not Found");
      }else{
        res.writeHead(200, {"Content-Type": "text/css"});
        res.write(data);
        res.end();
      }
    });
  }
}

http.createServer(routeRequests).listen(8081);
