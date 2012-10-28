var trimesh = require('trimesh');

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
  this.column = c;
  this.value  = v;
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
    max_distance: 1.01 * outer_radius
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
      if(dist > outer_radius) {
        continue;
      }
      
      //Compute vertex weight
      var weight = 0.0;
      var star = stars[j];
      for(var k=0; k<star.length; ++k) {
        var tri = faces[star[k]];
        var a = positions[tri[0]];
        var b = positions[tri[1]];
        var c = positions[tri[2]];
        
        var ab = new Array(3);
        var ac = new Array(3);
        for(var l=0; l<3; ++l) {
          ab[l] = b[l] - a[l];
          ac[l] = c[l] - a[l];
        }
        
        var area2 = 0.0;
        for(var l=0; l<3; ++l) {
          var u = (l+1)%3;
          var v = (l+2)%3;
          var d = ab[u] * ac[v] - ab[v] * ac[u];
          area2 += d * d;
        }
        weight += Math.sqrt(area2);
      }
      
      if(dist < inner_radius) {
        row_inner.push(new ColumnEntry(j, weight));
        inner_weight += weight;
      } else {
        row_outer.push(new ColumnEntry(j, weight));
        outer_weight += weight;
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
 
  //Compile action 
  var prog_string = [ 
      "var w=" + sigmoid("m", "0.5", this.alpha_m) + ";",
      "var wi=1.0-w;",
      "return " + sigmoid_n("n", 
                    "wi*" + this.life_range[0] + "+w*" + this.death_range[0], 
                    "wi*" + this.life_range[1] + "+w*" + this.death_range[1],
                    this.alpha_n) + ";" 
    ].join("\n");
  this.action = new Function("n", "m", prog_string);
  
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
    
    nstate[i] = S(N, M);
  }

  //Swap buffers
  var tmp = this.state;
  this.state = this.next_state;
  this.next_state = tmp;
};


exports.MeshLife = MeshLife;
