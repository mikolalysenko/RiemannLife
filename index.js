// MeshLife WebGL demo
// Author: Mikola Lysenko (http://0fps.net)
// License: BSD
var trimesh = require('trimesh');
var MeshLife = require('./meshlife.js').MeshLife;
var bunny = require('meshdata').bunny;

//Flattens an array
function flatten(arr) {
  var flat = [];
  for(var i=0; i<arr.length; ++i) {
    var row = arr[i];
    for(var j=0; j<row.length; ++j) {
      flat.push(row[j]);
    }
  }
  return flat;
}

// Render (using setInterval as WebGL Inspector have problem with requestAnimationFrame)
var nextFrame = (function(){
      return  window.requestAnimationFrame       || 
              window.webkitRequestAnimationFrame || 
              window.mozRequestAnimationFrame    || 
              window.oRequestAnimationFrame      || 
              window.msRequestAnimationFrame     || 
              function( callback ){
                window.setTimeout(callback, 1000 / 60);
              };
    })();
    

//Context and mesh shader variables
var context, meshShader, simulation, paused = false;


//Initialize game of life
function reset() {
  var splat_count = parseInt($("#ctrl_Splats").val());
  for(var i=0; i<splat_count; ++i) {
    simulation.splat(Math.floor(Math.random() * simulation.vertex_count));
  }
}

//Rebuilds the solver/stiffness matrix
function rebuild() {


  //TODO: Get mesh based on value of drop down
  var mesh = bunny;
  
  //TODO: Apply subdivisions here
  var subdiv_count = parseInt($("#ctrl_Suddivs").val());

  //Create simulation
  simulation = new MeshLife({
    positions:    mesh.positions,
    faces:        mesh.faces,
    outer_radius: parseFloat($("#ctrl_OuterRadius").val()),
    inner_radius: parseFloat($("#ctrl_InnerRadius").val()),
    alpha_n:      parseFloat($("#ctrl_AlphaN").val()),
    alpha_m:      parseFloat($("#ctrl_AlphaM").val()),
    life_range:   [ parseFloat($("#ctrl_LiveLo").val()), parseFloat($("#ctrl_LiveHi").val()) ],
    death_range:  [ parseFloat($("#ctrl_DeadLo").val()), parseFloat($("#ctrl_DeadHi").val()) ]
  });

  //Reset simulation
  reset();  
  
  //Release previous shader if in use
  if(meshShader) {
    meshShader.dispose();
  }
  
  //Create mesh shader
  var meshShaderInfo = {    
    vertexShader: [
      "uniform     mat4     transform;",
      "uniform     mat4     cameraInverse;",
      "uniform     mat4     cameraProjection;",
      
      "attribute  vec3      position;",
      "attribute  float     state;",
      
      "varying    float     intensity;",
      
      "void main(void) {",
        "gl_Position = cameraProjection * cameraInverse * transform * vec4( position, 1.0 );",
        "intensity = state;",
      "}"
    ].join("\n"),
    fragmentShader: [
      "#ifdef GL_ES",
        "precision highp float;",
      "#endif",    

      "varying float intensity;",
      "void main() {",
        "gl_FragColor = vec4(1, intensity, 0, 1);",
      "}"
    ].join("\n"),
    data: {
      transform:        new GLOW.Matrix4(),
      cameraInverse:    GLOW.defaultCamera.inverse,
      cameraProjection: GLOW.defaultCamera.projection,
      position:         new Float32Array(flatten(simulation.positions)),
      state:            simulation.state
    },
    interleave: {
      state: false
    },
    indices: new Uint16Array(flatten(simulation.faces)),
    primitive: GL.TRIANGLES
  };

  meshShader = new GLOW.Shader(meshShaderInfo);
}



//Initialize WebGL/GLOW
function init() {
  // create a context and set white background
  try {
    context = new GLOW.Context();
  } catch(e) {
    alert("WebGL not supported :-(");
    return false;
  }

  //Make sure we have floating point textures
  if( !context.enableExtension( "OES_texture_float" )) {
    alert( "No support for float textures!" );
    return false;
  }

  //Set up basic parameters
  context.setupClear( { red: 0, green: 1, blue: 1 } );

  // attach the context's DOM element
  var container = document.getElementById("container");
  container.appendChild( context.domElement );

  //Set up camera
  GLOW.defaultCamera.localMatrix.setPosition( 0, 0, 50 );
  GLOW.defaultCamera.update();

  //Rebuild the system
  rebuild();

  $("#ctrl_Reset").click(reset);
  $("#ctrl_Rebuild").click(rebuild);
  $("#ctrl_Step").click(function() {
    simulation.step();
  });
  $("#ctrl_Pause").click(function() {
    if(paused) {
      $("#ctrl_Pause").val("Pause");
      paused = false;
    } else {
      $("#ctrl_Pause").val("Resume");
      paused = true;
    }
  });
  
  //Success
  render();
}

//Render a frame
function render() {
  //Initialize context
  context.cache.clear();
  context.enableDepthTest(false);
  context.clear();
  
  //Update game of life
  if(!paused) {
    simulation.step();
  }
  meshShader.state.bufferData(simulation.state, GL.DYNAMIC_DRAW);
  meshShader.draw();
  
  nextFrame(render);
}

//Call load when document is ready
$(document).ready(init);

