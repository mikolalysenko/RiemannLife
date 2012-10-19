var Simulator = require('./riemann.js').Simulator;
var bunny = require('meshdata').bunny;


//Initialize simulation
var N = bunny.positions.length;
var gliders = new Simulator({
  outer_radius: 2.0
});

var K = gliders.stiffness_matrix(bunny);

K.state = new Array(N);
K.next_state = new Array(N);
for(var i=0; i<N; ++i) {
  K.state[i] = K.next_state[i] = 0.0;
}

document.mesh = bunny;

document.next_state = function() {
  gliders.next_state(K);
  
  var tmp = K.state;
  K.state = K.next_state;
  K.next_state = tmp;
  return K.state;
}

