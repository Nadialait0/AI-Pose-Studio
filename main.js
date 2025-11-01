let scene, camera, renderer, controls, clock;
let currentVrm = null, gui = null, guiControllers = {}, poseAnimationData = null;
let animationStartTime = 0, isPlaying = false;

const boneRotations = {
  hips:{x:0,y:0,z:0}, spine:{x:0,y:0,z:0}, chest:{x:0,y:0,z:0},
  neck:{x:0,y:0,z:0}, head:{x:0,y:0,z:0},
  leftUpperArm:{x:0,y:0,z:0}, leftLowerArm:{x:0,y:0,z:0}, leftHand:{x:0,y:0,z:0},
  rightUpperArm:{x:0,y:0,z:0}, rightLowerArm:{x:0,y:0,z:0}, rightHand:{x:0,y:0,z:0},
  leftUpperLeg:{x:0,y:0,z:0}, leftLowerLeg:{x:0,y:0,z:0}, leftFoot:{x:0,y:0,z:0},
  rightUpperLeg:{x:0,y:0,z:0}, rightLowerLeg:{x:0,y:0,z:0}, rightFoot:{x:0,y:0,z:0}
};

const infoEl = document.getElementById('info');

function updateInfo(msg, ok=false){
  infoEl.innerHTML = ok ? `✅ ${msg}` : `💡 ${msg}`;
}

function initRenderer(){
  const wrapper = document.getElementById('viewer');
  renderer = new THREE.WebGLRenderer({antialias:true,alpha:true});
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(wrapper.clientWidth, wrapper.clientHeight);
  renderer.setClearColor(0xf6f9fc,1);
  wrapper.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(45, wrapper.clientWidth / wrapper.clientHeight, 0.1, 1000);
  camera.position.set(0,1.4,3);

  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.target.set(0,1.2,0);
  controls.update();

  const amb = new THREE.AmbientLight(0xffffff, 1.2);
  const dir = new THREE.DirectionalLight(0xffffff, 1);
  dir.position.set(5,10,5);
  scene.add(amb, dir);

  clock = new THREE.Clock();
  window.addEventListener('resize', onResize);
  animate();
}

function onResize(){
  const w = viewer.clientWidth, h = viewer.clientHeight;
  renderer.setSize(w,h); camera.aspect=w/h; camera.updateProjectionMatrix();
}

function animate(){
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  if(currentVrm && currentVrm.update) currentVrm.update(delta);
  if(poseAnimationData && isPlaying) applyAnimationPlayback();
  renderer.render(scene, camera);
}

const gltfLoader = new THREE.GLTFLoader();
document.getElementById('upload-vrm').addEventListener('change', e=>{
  const file=e.target.files[0]; if(!file)return;
  updateInfo('Chargement VRM...');
  const reader=new FileReader();
  reader.onload=evt=>{
    gltfLoader.parse(evt.target.result,'',async gltf=>{
      if(currentVrm && currentVrm.scene) scene.remove(currentVrm.scene);
      const vrm = await THREE.VRM.from(gltf);
      currentVrm=vrm;
      currentVrm.scene.position.set(0, 0, 0);
      scene.add(currentVrm.scene);
      updateInfo('VRM chargé.',true);
      setupGUI();
    });
  };
  reader.readAsArrayBuffer(file);
});

function setupGUI(){
  if(gui) gui.destroy();
  gui=new dat.GUI({autoPlace:false,width:280});
  document.getElementById('datgui-container').appendChild(gui.domElement);
  guiControllers={};
  Object.keys(boneRotations).forEach(b=>{
    const f=gui.addFolder(b);
    guiControllers[b]={};
    ['x','y','z'].forEach(k=>{
      guiControllers[b][k]=f.add(boneRotations[b],k,-180,180).step(1).onChange(()=>updateBones(b));
    });
  });
}

function updateBones(target=null){
  if(!currentVrm)return;
  const list=target?[target]:Object.keys(boneRotations);
  list.forEach(name=>{
    const rot=boneRotations[name];
    const bone=currentVrm.humanoid.getBoneNode(name);
    if(bone){
      const e=new THREE.Euler(
        THREE.Math.degToRad(rot.x),
        THREE.Math.degToRad(rot.y),
        THREE.Math.degToRad(rot.z)
      );
      bone.quaternion.setFromEuler(e);
    }
  });
}

function exportPose(){
  const data={frames:[{time:0,bones:{}}]};
  for(const [k,v] of Object.entries(boneRotations)){
    data.frames[0].bones[k]={rotation:[v.x,v.y,v.z]};
  }
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);
  a.download='pose.json';a.click();
  updateInfo('Pose exportée.',true);
}

function resetPose(){
  for(const k in boneRotations){boneRotations[k].x=boneRotations[k].y=boneRotations[k].z=0;}
  for(const b in guiControllers){
    for(const k of ['x','y','z']) guiControllers[b][k].setValue(0);
  }
  updateBones(); updateInfo('Pose réinitialisée.',true);
}

document.getElementById('export-pose').onclick=exportPose;
document.getElementById('reset').onclick=resetPose;

document.getElementById('upload-json').addEventListener('change', e=>{
  const file=e.target.files[0]; if(!file)return;
  const r=new FileReader();
  r.onload=evt=>{
    const data=JSON.parse(evt.target.result);
    if(!data.frames)return;
    poseAnimationData=data;
    if(data.frames.length===1){
      const frame=data.frames[0];
      for(const b in frame.bones){
        if(boneRotations[b]){
          const r=frame.bones[b].rotation;
          boneRotations[b].x=r[0];boneRotations[b].y=r[1];boneRotations[b].z=r[2];
          ['x','y','z'].forEach(k=>guiControllers[b]?.[k].setValue(r[k]));
        }
      }
      updateBones(); updateInfo('Pose appliquée.',true);
    }else{isPlaying=true;animationStartTime=performance.now();}
  };
  r.readAsText(file);
});

function applyAnimationPlayback(){
  const f=poseAnimationData.frames;
  const d=f[f.length-1].time;
  const t=((performance.now()-animationStartTime)/1000)%d;
  document.getElementById('timeline').value=t/d;
  let A=f[0],B=f[f.length-1];
  for(let i=0;i<f.length-1;i++){if(f[i].time<=t&&t<f[i+1].time){A=f[i];B=f[i+1];break;}}
  const k=(t-A.time)/(B.time-A.time);
  for(const b in boneRotations){
    if(A.bones[b]&&B.bones[b]){
      const ra=A.bones[b].rotation,rb=B.bones[b].rotation;
      boneRotations[b].x=ra[0]+k*(rb[0]-ra[0]);
      boneRotations[b].y=ra[1]+k*(rb[1]-ra[1]);
      boneRotations[b].z=ra[2]+k*(rb[2]-ra[2]);
      ['x','y','z'].forEach(a=>guiControllers[b]?.[a].setValue(boneRotations[b][a]));
    }
  }
  updateBones();
}

document.getElementById('play-pause').onclick=()=>{
  if(!poseAnimationData)return;
  isPlaying=!isPlaying;
  document.getElementById('play-pause').textContent=isPlaying?'⏸️':'▶️';
  if(isPlaying) animationStartTime=performance.now();
};

initRenderer();
updateInfo('Prêt — charge un modèle VRM.');
