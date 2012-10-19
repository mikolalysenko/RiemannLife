var Simulator = require('./riemann.js').Simulator;
var bunny = require('meshdata').bunny;


//Initialize simulation
var N = bunny.positions.length;
var gliders = new Simulator({
  outer_radius: 0.1
});

console.log("Building K...");
var K = gliders.stiffness_matrix(bunny);
console.log("Done");

K.state = new Array(N);
K.next_state = new Array(N);
for(var i=0; i<N; ++i) {
  K.state[i] = K.next_state[i] = 0.0;
}


//Simulate
console.log("Simulating...");
for(var i=0; i<100; ++i) {
  gliders.next_state(K);
  
  var tmp = K.state;
  K.state = K.next_state;
  K.next_state = tmp;
}

