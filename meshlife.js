var trimesh = require('trimesh');
var EPSILON = 1e-6;

/*
function sigma1(x, a, alpha) {
  return 1.0 / (1.0 + exp(-4.0*(x-a)/alpha));
}

function sigma_n(x, a, b) {
  return sigma1(x, a, ALPHA_N) * (1.0 - sigma1(x, b, ALPHA_N));
}

function sigma_m(x, y, m) {
  var w = sigma1(m, 0.5, ALPHA_M);
  return x*(1.0-w)+y*w;
}

function S(n, m) {
  return sigma_n(n,
          sigma_m(BIRTH_LO, DEATH_LO, m),
          sigma_m(BIRTH_HI, DEATH_HI, m));
}
*/

function sigmoid(x, a, b) {
  return "(1.0/(1.0+Math.exp(-4.0*((X)-(A))/(B))))".replace("X", x).replace("A", a).replace("B", b);
}

function sigmoid_n(x, a, b, alpha_n) {
  return "(" + sigmoid(x, a, alpha_n) + "*(1.0-" + sigmoid(x, b, alpha_n) + "))";
}

function ColumnEntry(c, v) {
  this.column = parseInt(c);
  this.value  = v;
}

//Compute weight associated to polygon
var CLIPPED = new Array(5);
var PQ = new Array(3);
var PR = new Array(3);
(function() {
  for(var i=0; i<5; ++i) {
    CLIPPED[i] = new Array(3);
  }
})();


function perp(a, b) {
  var s = 0.0;
  for(var i=0; i<3; ++i) {
    var u = (i+1)%3;
    var v = (i+2)%3;
    var d = a[u] * b[v] - a[v] * b[u];
    s += d * d;
  }
  return Math.sqrt(s);
}


function area(a, b, c) {
  var ab = new Array(3);
  var ac = new Array(3);
  for(var i=0; i<3; ++i) {
    ab[i] = b[i] - a[i];
    ac[i] = c[i] - a[i];
  }
  
  return 0.5 * perp(ab, ac);
}


function weight(a, b, c, da, db, dc, r) {

  //First clip polygon
  var weights = [da - r, db - r, dc - r];
  var signs = new Array(3);
  var all_in = true;
  var all_out = true;
  for(var i=0; i<3; ++i) {
    signs[i] = weights[i] < 0;
    
    all_out = all_out && !signs[i];
    all_in  = all_in  &&  signs[i]
  }
  
  //Check for early out
  if(all_out) { return 0.0; }
  if(all_in)  { return area(a, b, c) / 3.0; }
  
  var poly = [a, b, c];
  var clip_count = 0;
  for(var i=0; i<3; ++i) {
    
    var n = (i+1)%3;
    var cs = signs[i];
    var ns = signs[n];
    
    if(cs) {
      for(var j=0; j<3; ++j) {
        CLIPPED[clip_count][j] = poly[i][j];
      }
      clip_count++;
    }
    
    if(cs !== ns) {
      var cw = weights[i];
      var nw = weights[n];
      var t = cw / (cw - nw);
      var P = poly[i];
      var Q = poly[(i+1)%3];
      for(var j=0; j<3; ++j) {
        CLIPPED[clip_count][j] = (1.0 - t) * P[j] + t * Q[j];
      }
      clip_count++;
    }
  }
  
  //Now compute weight
  var w = 0.0;
  var centroid = new Array(3);
  for(var i=2; i<clip_count; ++i) {
    var P = CLIPPED[0];
    var Q = CLIPPED[(i-1)];
    var R = CLIPPED[i];

    for(var j=0; j<3; ++j) {
      centroid[j] = (P[j] + Q[j] + R[j]) / 3.0;
    }
  
    var alpha = area(P, Q, R);
    w += alpha * area(centroid, b, c);
  }
 
  //Finally, return scaled weight
  return w / area(a, b, c);
}

//Computes the stiffness matrix for the system
function stiffness_matrix(args) {

  var positions     = args.positions;
  var faces         = args.faces;
  var stars         = args.stars;
  var inner_radius  = args.inner_radius;
  var outer_radius  = args.outer_radius;
  
  var compare_column = new Function("a", "b", "return a.column - b.column;");
  
  
  //Arguments to distance transform
  var distance_args = {
    positions: positions,
    faces: faces,
    initial_vertex: 0,
    stars: stars,
    max_distance: 2.0 * outer_radius
  };
  
  var K_inner = new Array(positions.length);
  var K_outer = new Array(positions.length);
  
  for(var i=0; i<positions.length; ++i) {
  
    distance_args.initial_vertex = i;
    var distances = trimesh.surface_distance_to_point(distance_args);
    
    var row_inner = [];
    var row_outer = [];
    
    var inner_weight = 0.0;
    var outer_weight = 0.0;
    
    for(var j in distances) {
      var dist = distances[j];
      
      //Compute vertex weight
      var wi = 0.0;
      var wo = 0.0;
      var star = stars[j];
      for(var k=0; k<star.length; ++k) {
        var tri = faces[star[k]];
        
        //Get root vertex
        var n = 0;
        if(tri[1] === j) {
          n = 1;
        } else if(tri[2] === j) {
          n = 2;
        }
        var m = (n+1)%3;
        var l = (n+2)%3;
        
        //Compute distances
        var a = positions[tri[n]];
        var b = positions[tri[m]];
        var c = positions[tri[l]];
        
        var da = distances[tri[n]] ;
        var db = tri[m] in distances ? distances[tri[m]] : 1e20;
        var dc = tri[l] in distances ? distances[tri[l]] : 1e20; 
        
        //Compute weights
        wi += weight(a, b, c, da, db, dc, inner_radius);
        wo += weight(a, b, c, da, db, dc, outer_radius);
      }
      
      if(wi > EPSILON) {
        row_inner.push(new ColumnEntry(j, wi));
        inner_weight += wi;
      }
      if(wo - wi > EPSILON) {
        row_outer.push(new ColumnEntry(j, wo - wi));
        outer_weight += wo - wi;
      }
    }
  
    //Rescale inner matrix
    var s = 1.0 / inner_weight;
    for(var j=0; j<row_inner.length; ++j) {
      row_inner[j].value *= s;
    }
    row_inner.sort(compare_column);
    K_inner[i] = row_inner;
    
    //Rescale outer matrix
    var s = 1.0 / outer_weight;
    for(var j=0; j<row_outer.length; ++j) {
      row_outer[j].value *= s;
    }
    row_outer.sort(compare_column);
    K_outer[i] = row_outer;
  }
  
  return { K_inner: K_inner, K_outer: K_outer };
};


var STEP_FUNC = {
  "discrete": "f",
  "smooth1": "g+dt*(2.0*f-1.0)",
  "smooth2": "g+dt*(f-g)",
  "smooth3": "m+dt*(2.0*f-1.0)",
  "smooth4": "m+dt*(f-m)",
};


function MeshLife(params) {

  if(!params) {
    params = {};
  }
  
  this.positions    = params.positions || [];
  this.faces        = params.faces || [];
  this.vertex_count = this.positions.length;
  this.stars        = params.stars || trimesh.vertex_stars({
                              vertex_count: this.vertex_count,
                              faces: this.faces });
  this.outer_radius = params.outer_radius || 1.0;
  this.inner_radius = params.inner_radius || this.outer_radius / 3.0;
  this.alpha_n      = params.alpha_n || 0.028;
  this.alpha_m      = params.alpha_m || 0.147;
  this.life_range   = params.life_range || [ 0.278, 0.365 ];
  this.death_range  = params.death_range || [ 0.267, 0.445 ];
  this.step_mode    = params.step_mode || "discrete";
  this.delta_t      = params.delta_t || 0.01;
 
  //Compile action 
  var prog_string = [ 
      "var w=" + sigmoid("m", "0.5", this.alpha_m) + ";",
      "var wi=1.0-w;",
      "var f = " + sigmoid_n("n", 
                    "wi*" + this.life_range[0] + "+w*" + this.death_range[0], 
                    "wi*" + this.life_range[1] + "+w*" + this.death_range[1],
                    this.alpha_n) + ";",
      "var dt = " + this.delta_t + ";",
      "return " + STEP_FUNC[this.step_mode] + ";"
    ].join("\n");
  this.action = new Function("n", "m", "g", prog_string);
  
  //Build stiffness matrix
  if(params.K_inner && params.K_outer) {
    this.K_inner      = params.K_inner;
    this.K_outer      = params.K_outer;
  } else {
    var K = stiffness_matrix(this);
    this.K_inner      = K.K_inner;
    this.K_outer      = K.K_outer;
  }
    
  //Allocate state buffers
  this.state        = new Float32Array(this.vertex_count);
  this.next_state   = new Float32Array(this.vertex_count);
  for(var i=0; i<this.vertex_count; ++i) {
    this.state[i] = this.next_state[i] = 0.0;
  }
}


//Adds a cell at a given point in the mesh
MeshLife.prototype.splat = function(vertex_num) {
  var row     = this.K_inner[vertex_num];
  var state   = this.state;
  for(var i=0; i<row.length; ++i) {
    var entry = row[i];
    state[entry.column] = 1.0;
    //state[entry.column] += entry.value / row[0].value;
  }
}


//Steps the simulation one time step forward
MeshLife.prototype.step = function() {

  var K_inner       = this.K_inner;
  var K_outer       = this.K_outer;
  var state         = this.state;
  var nstate        = this.next_state;
  var S             = this.action;
  var vertex_count  = this.vertex_count;

  for(var i=0; i<vertex_count; ++i) {
    
    var M = 0.0;
    var row_inner = K_inner[i];
    for(var j=0; j<row_inner.length; ++j) {
      var entry = row_inner[j];
      M += entry.value * state[entry.column];
    }
    
    var N = 0.0;
    var row_outer = K_outer[i];
    for(var j=0; j<row_outer.length; ++j) {
      var entry = row_outer[j];
      N += entry.value * state[entry.column];
    }
    
    nstate[i] = S(N, M, state[i]);
  }

  //Swap buffers
  var tmp = this.state;
  this.state = this.next_state;
  this.next_state = tmp;
};


exports.MeshLife = MeshLife;
