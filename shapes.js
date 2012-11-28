var meshdata = require('meshdata');
var trimesh = require('trimesh');

function createMoebius(u_res, v_res) {
  var faces     = [];
  var vertices  = [];
  var stripes   = [];

  for(var j=0; j<u_res; ++j) {
    var stripe = [];
    var u = (2.0 * Math.PI * j) / u_res;
    for(var i=-v_res; i<=v_res; ++i) {
      stripe.push(vertices.length);
      var v = i / v_res;
      var a = 10.0*(1.0 + 0.5 * v * Math.cos(0.5 * u));
      var b = 10.0*(0.5 * v * Math.sin(0.5 * u));
      vertices.push([a * Math.cos(u), a * Math.sin(u), b]);
    }
    
    stripes.push(stripe);
    
    if(j > 0) {
      var s0 = stripes[stripes.length-2];
      var s1 = stripe;
      for(var i=1; i<stripe.length; ++i) {
        faces.push([ s0[i-1], s1[i-1], s0[i] ]);
        faces.push([ s1[i-1], s1[i], s0[i] ]);
      }
    }
  }
  
  s0 = stripes[stripes.length-1];
  s1 = stripes[0];
  s1.reverse();
  for(var i=1; i<stripe.length; ++i) {
    faces.push([ s0[i-1], s1[i-1], s0[i] ]);
    faces.push([ s1[i-1], s1[i], s0[i] ]);
  }
  
  
  return {faces: faces, positions:vertices};
}

function createSphere(res) {
  return trimesh.surface_nets({
    resolution: res,
    potential: function(x,y,z) {
      return x*x+y*y+z*z-100;
    },
    bounds:[[-12,-12,-12],[12,12,12]]
  });
}

function createTorus(u_res, v_res) {
  var faces     = [];
  var vertices  = [];
  var stripes   = [];

  for(var j=0; j<u_res; ++j) {
    var stripe = [];
    var u = (2.0 * Math.PI * j) / u_res;
    for(var i=0; i<v_res; ++i) {
      stripe.push(vertices.length);
      var v = (2.0 * Math.PI * (i + 0.5 * (j&1))) / v_res;
      var a = 10.0 + 5.0 * Math.cos(v);
      var b = 5.0 * Math.sin(v);
      vertices.push([a * Math.cos(u), a * Math.sin(u), b  ]);
    }
    
    stripes.push(stripe);
  }
  
  for(var i=0; i<stripes.length; ++i) {
    var s0 = stripes[i];
    var s1 = stripes[(i+1)%stripes.length];
    var s2 = stripes[(i+2)%stripes.length];
    
    for(var j=0; j<s1.length; ++j) {
      var d = (i&1) ? v_res-1 : 1;
      faces.push([s0[j], s1[j], s2[j]]);
      faces.push([s0[(j+d)%v_res], s1[j], s2[(j+d)%v_res]]);
    }
  }
  return {faces: faces, positions:vertices};
};


function createKlein(u_res, v_res) {
  var faces     = [];
  var vertices  = [];
  var stripes   = [];

  for(var j=0; j<u_res; ++j) {
    var stripe = [];
    var u = (2.0 * Math.PI * j) / u_res;
    for(var i=0; i<v_res; ++i) {
      stripe.push(vertices.length);
      var v = (2.0 * Math.PI * (i + 0.5 * (j&1))) / v_res;
      
      var r = 4.0 * (1.0 - 0.5 * Math.cos(u));
      var x, y;
      
      if(u < Math.PI) {
        x = 6 * Math.cos(u)*(1+Math.sin(u)) + r*Math.cos(u)*Math.cos(v);
        y = 16* Math.sin(u) + r*Math.sin(u)*Math.cos(v);
      } else {
        x = 6*Math.cos(u)*(1+Math.sin(u)) + r*Math.cos(v+Math.PI);
        y = 16 * Math.sin(u);
      }
      z = r * Math.sin(v);
      vertices.push([x, y, z]);
    }
    
    stripes.push(stripe);
  }
  
  for(var i=0; i+2<stripes.length; ++i) {
    var s0 = stripes[i];
    var s1 = stripes[(i+1)%stripes.length];
    var s2 = stripes[(i+2)%stripes.length];
    var dl = (i&1) ? v_res-1 : 1;
    var dr = dl;
    
    for(var j=0; j<s1.length; ++j) {
      faces.push([s0[j], s1[j], s2[j]]);
      faces.push([s0[(j+dl)%v_res], s1[j], s2[(j+dr)%v_res]]);
    }
  }
  
  //FIXME: Need to connect across twist...
  
  return {faces: faces, positions:vertices};
};



exports.meshSet = {
  "Sphere": createSphere([32,32,32]),
  "Torus":  createTorus(300, 75),
  "Möbius": createMoebius(150,30),
  "Bunny": meshdata.bunny,
  "Cube": trimesh.cube_mesh(10, [20,20,20]),
  "Grid": trimesh.grid_mesh(10, 10)
};
