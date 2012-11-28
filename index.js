// MeshLife WebGL demo
// Author: Mikola Lysenko (http://0fps.net)
// License: BSD
var trimesh = require('trimesh');
var MeshLife = require('./meshlife.js').MeshLife;
var loop_subdivide = trimesh.loop_subdivision;
var ArcballCamera = require('./arcball.js').ArcballCamera;
var meshSet = require("./shapes.js").meshSet;

function hex2rgb(hex) {
  return [ (hex>>16)/255.0, ((hex>>8)&0xff)/255.0, (hex&0xff)/255.0 ]
}

var color_scheme = {
  bg_color:     hex2rgb(0x64aad0),
  light_color:  hex2rgb(0x3914af),
  dark_color:   hex2rgb(0x41db00),
  cell_color:   hex2rgb(0xff8b00)
};


//Context and mesh shader variables
var context;
var meshShader;
var simulation;
var paused = false;
var camera = new ArcballCamera();
var old_params = { mesh: "", inner_radius: 0, outer_radius: 0 };
var buttons = {
  rotate: false,
  zoom: false,
  pan: false
};


function printVec3(vec) {
  return "vec3(" + vec[0] + "," + vec[1] + "," + vec[2] + ")";
}

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
    
//Retrieves parameters
function getParams() {
  return {
    mesh:         $("#ctrl_Mesh").val(),
    subdiv_count: parseInt($("#ctrl_Subdivs").val()),
    outer_radius: parseFloat($("#ctrl_OuterRadius").val()),
    inner_radius: parseFloat($("#ctrl_InnerRadius").val()),
    alpha_n:      parseFloat($("#ctrl_AlphaN").val()),
    alpha_m:      parseFloat($("#ctrl_AlphaM").val()),
    life_range:   [ parseFloat($("#ctrl_LiveLo").val()), parseFloat($("#ctrl_LiveHi").val()) ],
    death_range:  [ parseFloat($("#ctrl_DeadLo").val()), parseFloat($("#ctrl_DeadHi").val()) ],
    initial_sites:  parseInt($("#ctrl_Splats").val()),
    delta_t:      parseFloat($("#ctrl_Timestep").val()),
    step_mode:    $("#ctrl_Timestep").val()
  }
}

//Initialize game of life
function reset() {
  for(var i=0; i<simulation.vertex_count; ++i) {
    simulation.state[i] = 0.0;
  }
  var splat_count = parseInt($("#ctrl_Splats").val());
  for(var i=0; i<splat_count; ++i) {
    simulation.splat(Math.floor(Math.random() * simulation.vertex_count));
  }
}

//Rebuilds the solver/stiffness matrix
function rebuild() {

  var params = getParams();

  if(params.mesh !== old_params.mesh ||
     params.inner_radius !== old_params.inner_radius ||
     params.outer_radius !== old_params.outer_radius ||
     params.subdiv_count !== old_params.subdiv_count) {

    //TODO: Get mesh based on value of drop down
    var mesh = meshSet[params.mesh];
    
    //Apply subdivisions
    for(var i=0; i<params.subdiv_count; ++i) {
      mesh = loop_subdivide(mesh);
    }
    
    params.positions = mesh.positions;
    params.faces = mesh.faces;

    //Create simulation
    simulation = new MeshLife(params);
    
    //Save parameters
    params.stars   = simulation.stars;
    params.K_inner = simulation.K_inner;
    params.K_outer = simulation.K_outer;

    params.normals = trimesh.vertex_normals({
      positions: mesh.positions,
      faces:     mesh.faces,
      stars:     simulation.stars
    });
    
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
        "attribute  vec3      normal;",
        "attribute  float     state;",
        
        "varying    float     intensity;",
        "varying    vec3      f_normal;",
        
        "void main(void) {",
          "gl_Position = cameraProjection * cameraInverse * transform * vec4( 0.2*normal*state + position, 1.0 );",
          "intensity = state;",
          "f_normal = normal;",
        "}"
      ].join("\n"),
      fragmentShader: [
        "#ifdef GL_ES",
          "precision highp float;",
        "#endif",    

        "varying float intensity;",
        "varying vec3  f_normal;",
        
        "#define LIGHT_COLOR " + printVec3(color_scheme.light_color),
        "#define DARK_COLOR  " + printVec3(color_scheme.dark_color),
        "#define CELL_COLOR  " + printVec3(color_scheme.cell_color),
        
        "void main() {",
          "float light = 0.3 * dot(normalize(f_normal), vec3(0, 1, 0)) + 0.5;",
          "gl_FragColor = vec4(mix(mix(LIGHT_COLOR, DARK_COLOR, light), CELL_COLOR, intensity), 1);",
        "}"
      ].join("\n"),
      data: {
        transform:        new GLOW.Matrix4(),
        cameraInverse:    GLOW.defaultCamera.inverse,
        cameraProjection: GLOW.defaultCamera.projection,
        position:         new Float32Array(flatten(simulation.positions)),
        normal:           new Float32Array(flatten(params.normals)),
        state:            simulation.state
      },
      interleave: {
        state: false
      },
      indices: new Uint16Array(flatten(simulation.faces)),
      primitive: GL.TRIANGLES
    };

    meshShader = new GLOW.Shader(meshShaderInfo);
    
  } else {
  
    params.positions  = old_params.positions;
    params.faces      = old_params.faces;
    params.normals    = old_params.normals;
    params.stars      = old_params.stars;
    params.K_inner    = old_params.K_inner;
    params.K_outer    = old_params.K_outer;
    
    simulation        = new MeshLife(params);
  }
  
  //Save parameters
  old_params = params;
  
  //Reset simulation
  reset();
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
  context.setupClear( { red: color_scheme.bg_color[0], green: color_scheme.bg_color[1], blue: color_scheme.bg_color[2] } );

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
  $("#container").mousemove(function(e) {
    var container = $("#container");
    camera.update(e.pageX/container.width()-0.5, e.pageY/container.height()-0.5, {
      rotate: buttons.rotate || !(e.ctrlKey || e.altKey) && (e.which === 1),
      pan:    buttons.pan    || (e.altKey && e.which !== 0) || (e.which === 2),
      zoom:   buttons.zoom   || (e.ctrlKey && e.which !== 0) || e.which === 3
    });
  });
  $(document).keydown(function(e) {
    if(e.keyCode === 65) {
      buttons.rotate = true;
    }
    if(e.keyCode === 83) {
      buttons.pan = true;
    }
    if(e.keyCode === 68) {
      buttons.zoom = true;
    }
  });
  $(document).keyup(function(e) {
    if(e.keyCode === 65) {
      buttons.rotate = false;
    }
    if(e.keyCode === 83) {
      buttons.pan = false;
    }
    if(e.keyCode === 68) {
      buttons.zoom = false;
    }
  });  
  
  //Success
  render();
}

//Render a frame
function render() {
  //Initialize context
  context.cache.clear();
  context.enableDepthTest(true);
  context.enableCulling(false);
  context.clear();
  
  //Update game of life
  if(!paused) {
    simulation.step();
  }
  
  var matrix = camera.matrix();
  for(var i=0; i<4; ++i) {
    for(var j=0; j<4; ++j) {
      meshShader.transform.value[i+4*j] = matrix[i][j];
    }
  }
  
  meshShader.state.bufferData(simulation.state, GL.DYNAMIC_DRAW);
  meshShader.draw();
  
  nextFrame(render);
}

//Call load when document is ready
$(document).ready(init);

