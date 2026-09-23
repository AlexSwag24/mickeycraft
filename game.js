/* =========================================================
   Mickeycraft 3D - Game Engine (game.js)
========================================================= */

const SOUNDS = {
    jump: ['assets/mickeyjump1.wav', 'assets/mickeyjump2.wav'],
    hurt: ['assets/damage_hit.ogg', 'assets/mickeyhurt1.wav', 'assets/mickeyhurt2.wav', 'assets/mickeyhurt3.wav'],
    die:  ['assets/mickeydie1.wav', 'assets/mickeydie2.wav'],
    chat: ['assets/click.ogg', 'assets/mickeychat1.wav', 'assets/mickeychat2.wav'],
    digGrass: ['assets/grass1.ogg', 'assets/grass2.ogg'],
    digStone: ['assets/stone1.ogg', 'assets/stone2.ogg'],
    digWood: ['assets/wood1.ogg'],
    fallBig: ['assets/fall_big.ogg'],
    fallSmall: ['assets/fall_small.ogg'],
    portal: ['assets/portal.ogg'],
    eat: ['assets/eat1.ogg', 'assets/eat2.ogg'],
    drink: ['assets/drink.ogg'],
    fizz: ['assets/fizz.ogg']
};

function playRandomSound(arr, vol = 0.75) {
    if (!arr || !arr.length) return;
    const chosen = arr[Math.floor(Math.random() * arr.length)];
    const snd = new Audio(chosen);
    snd.volume = vol;
    snd.play().catch(() => {});
}

const bgmAudio = new Audio('assets/mutation.mp3');
bgmAudio.loop = true;
bgmAudio.volume = 0.45;

/* Local Storage World Persistence */
const STORAGE_KEY = "MICKEYCRAFT_WORLDS_V1";
let savedWorlds = {};

function loadWorldsFromStorage() {
    try {
        const data = localStorage.getItem(STORAGE_KEY);
        if (data) savedWorlds = JSON.parse(data);
    } catch (e) {
        savedWorlds = {};
    }
    if (Object.keys(savedWorlds).length === 0) {
        const defaultId = "world_" + Date.now();
        savedWorlds[defaultId] = {
            id: defaultId,
            name: "Mickey Valley",
            mode: "creative",
            seed: Math.floor(Math.random() * 99999),
            mods: { overworld: {}, nether: {} },
            spawnPoint: { x: 0, y: 8, z: 0 },
            time: 0,
            weather: 'clear'
        };
        saveWorldsToStorage();
    }
}

function saveWorldsToStorage() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(savedWorlds));
    } catch (e) {
        console.error("Storage save failed", e);
    }
}

loadWorldsFromStorage();
let activeWorldId = Object.keys(savedWorlds)[0];
let activeWorld = savedWorlds[activeWorldId];

let myPlayerName = "Mickey";
let isGameStarted = false;
let isDinnerbone = false;
let currentDimension = "overworld";
let renderRadius = 17;
let shadowsEnabled = true;
let playerHealth = 20; // 20 HP = 10 full hearts
let playerHunger = 20; // 20 hunger = 10 full drumsticks
let playerSaturation = 5.0;
let playerOxygen = 20; // 20 = 10 full bubbles
let isUnderwater = false;

/* Day/Night Cycle */
let worldTime = activeWorld.time || 0; // 0-24000 (0=sunrise, 6000=noon, 12000=sunset, 18000=midnight)
let dayNightSpeed = 0.5; // Multiplier for time progression

function updateDayNightCycle(delta) {
    if (currentDimension !== 'overworld') return;
    
    worldTime += delta * 20 * dayNightSpeed; // 20 minutes = 1 day
    if (worldTime >= 24000) worldTime = 0;
    activeWorld.time = worldTime;
    
    // Calculate sun position and color
    const dayProgress = worldTime / 24000;
    const sunAngle = dayProgress * Math.PI * 2;
    
    sun.position.set(
        Math.sin(sunAngle) * 50,
        Math.cos(sunAngle) * 50,
        20
    );
    
    // Adjust lighting based on time
    if (worldTime < 6000) { // Dawn
        const t = worldTime / 6000;
        ambientLight.intensity = 0.3 + (t * 0.3);
        sun.intensity = 0.4 + (t * 0.45);
        scene.background.setHex(lerpColor(0x1a1a2e, 0x78a7ff, t));
        scene.fog.color.setHex(lerpColor(0x1a1a2e, 0x78a7ff, t));
    } else if (worldTime < 12000) { // Day
        ambientLight.intensity = 0.6;
        sun.intensity = 0.85;
        scene.background.setHex(0x78a7ff);
        scene.fog.color.setHex(0x78a7ff);
    } else if (worldTime < 18000) { // Dusk
        const t = (worldTime - 12000) / 6000;
        ambientLight.intensity = 0.6 - (t * 0.3);
        sun.intensity = 0.85 - (t * 0.45);
        scene.background.setHex(lerpColor(0x78a7ff, 0x1a1a2e, t));
        scene.fog.color.setHex(lerpColor(0x78a7ff, 0x1a1a2e, t));
    } else { // Night
        ambientLight.intensity = 0.3;
        sun.intensity = 0.4;
        scene.background.setHex(0x1a1a2e);
        scene.fog.color.setHex(0x1a1a2e);
    }
}

function lerpColor(color1, color2, t) {
    const r1 = (color1 >> 16) & 0xff;
    const g1 = (color1 >> 8) & 0xff;
    const b1 = color1 & 0xff;
    const r2 = (color2 >> 16) & 0xff;
    const g2 = (color2 >> 8) & 0xff;
    const b2 = color2 & 0xff;
    
    const r = Math.round(r1 + (r2 - r1) * t);
    const g = Math.round(g1 + (g2 - g1) * t);
    const b = Math.round(b1 + (b2 - b1) * t);
    
    return (r << 16) | (g << 8) | b;
}

/* Weather System */
let weatherState = 'clear'; // 'clear', 'rain', 'storm'
let weatherParticles = null;

function createWeatherParticles() {
    if (weatherParticles) {
        scene.remove(weatherParticles);
        weatherParticles = null;
    }
    
    if (weatherState === 'clear') return;
    
    const particleCount = weatherState === 'storm' ? 3000 : 1500;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    
    for (let i = 0; i < particleCount * 3; i += 3) {
        positions[i] = (Math.random() - 0.5) * 80;
        positions[i + 1] = Math.random() * 40 + 20;
        positions[i + 2] = (Math.random() - 0.5) * 80;
    }
    
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    
    const material = new THREE.PointsMaterial({
        color: 0x88aaff,
        size: 0.15,
        transparent: true,
        opacity: 0.7
    });
    
    weatherParticles = new THREE.Points(geometry, material);
    scene.add(weatherParticles);
}

function updateWeatherParticles(delta) {
    if (!weatherParticles) return;
    
    const positions = weatherParticles.geometry.attributes.position.array;
    const fallSpeed = weatherState === 'storm' ? 18 : 12;
    
    for (let i = 0; i < positions.length; i += 3) {
        positions[i + 1] -= delta * fallSpeed;
        
        if (positions[i + 1] < 0) {
            positions[i + 1] = 40;
            positions[i] = playerGroup.position.x + (Math.random() - 0.5) * 80;
            positions[i + 2] = playerGroup.position.z + (Math.random() - 0.5) * 80;
        }
    }
    
    weatherParticles.geometry.attributes.position.needsUpdate = true;
}

function setWeather(state) {
    weatherState = state;
    activeWorld.weather = state;
    createWeatherParticles();
    
    if (state === 'storm') {
        ambientLight.intensity *= 0.7;
        sun.intensity *= 0.7;
    }
}

/* Hunger System */
let hungerTimer = 0;

function updateHunger(delta) {
    if (activeWorld.mode !== 'survival') return;
    
    hungerTimer += delta;
    
    // Deplete saturation first, then hunger
    if (hungerTimer >= 0.8) {
        hungerTimer = 0;
        
        if (playerSaturation > 0) {
            playerSaturation = Math.max(0, playerSaturation - 0.1);
        } else {
            playerHunger = Math.max(0, playerHunger - 1);
        }
        
        updateHungerDisplay();
    }
    
    // Health regeneration when hunger is full
    if (playerHunger >= 18 && playerHealth < 20) {
        if (hungerTimer >= 0.5) {
            playerHealth = Math.min(20, playerHealth + 1);
            playerSaturation = Math.max(0, playerSaturation - 1);
            updateHeartsDisplay();
        }
    }
    
    // Starvation damage
    if (playerHunger === 0 && hungerTimer >= 4) {
        playerHealth = Math.max(1, playerHealth - 1);
        updateHeartsDisplay();
        playRandomSound(SOUNDS.hurt, 0.6);
    }
}

function updateHungerDisplay() {
    const bar = document.getElementById('hunger-bar');
    if (activeWorld.mode !== 'survival') {
        bar.style.display = 'none';
        return;
    }
    bar.style.display = 'flex';
    bar.innerHTML = '';

    for (let i = 0; i < 10; i++) {
        const img = document.createElement('img');
        img.className = 'hunger-icon';
        const hungerPoints = playerHunger - (i * 2);

        if (hungerPoints >= 2) {
            img.src = 'assets/hunger_full.png';
        } else if (hungerPoints === 1) {
            img.src = 'assets/hunger_half.png';
        } else {
            img.src = 'assets/hunger_empty.png';
        }
        bar.appendChild(img);
    }
}

/* Oxygen/Drowning System */
let oxygenTimer = 0;

function updateOxygen(delta) {
    if (activeWorld.mode !== 'survival') return;
    
    // Check if player's head is underwater (simplified)
    const headY = playerGroup.position.y + 1.5;
    const headBlock = blockMeshMap.get(`${Math.round(playerGroup.position.x)},${Math.round(headY)},${Math.round(playerGroup.position.z)}`);
    
    // Assuming block ID 50 is water (you'll need to add this to GLOBAL_DICT)
    isUnderwater = headBlock && headBlock.userData.id === 50;
    
    if (isUnderwater) {
        oxygenTimer += delta;
        if (oxygenTimer >= 0.3) {
            oxygenTimer = 0;
            playerOxygen = Math.max(0, playerOxygen - 1);
            updateOxygenDisplay();
            
            if (playerOxygen === 0) {
                playerHealth = Math.max(0, playerHealth - 2);
                updateHeartsDisplay();
                playRandomSound(SOUNDS.hurt, 0.7);
            }
        }
    } else {
        if (playerOxygen < 20) {
            playerOxygen = Math.min(20, playerOxygen + delta * 5);
            updateOxygenDisplay();
        }
    }
}

function updateOxygenDisplay() {
    const bar = document.getElementById('oxygen-bar');
    if (!isUnderwater || activeWorld.mode !== 'survival') {
        bar.style.display = 'none';
        return;
    }
    bar.style.display = 'flex';
    bar.innerHTML = '';

    for (let i = 0; i < 10; i++) {
        const img = document.createElement('img');
        img.className = 'oxygen-icon';
        const oxygenPoints = playerOxygen - (i * 2);

        if (oxygenPoints >= 2) {
            img.src = 'assets/bubble.png';
        } else if (oxygenPoints === 1) {
            img.src = 'assets/bubble_pop.png';
        } else {
            img.src = 'assets/bubble.png';
            img.style.opacity = '0.2';
        }
        bar.appendChild(img);
    }
}

/* Pixel Heart Sprite HUD Renderer */
function updateHeartsDisplay() {
    const bar = document.getElementById('hearts-bar');
    if (activeWorld.mode !== 'survival') {
        bar.style.display = 'none';
        return;
    }
    bar.style.display = 'flex';
    bar.innerHTML = '';

    for (let i = 0; i < 10; i++) {
        const img = document.createElement('img');
        img.className = 'heart-icon';
        const heartPoints = playerHealth - (i * 2);

        if (heartPoints >= 2) {
            img.src = 'assets/heart.png';
        } else if (heartPoints === 1) {
            img.src = 'assets/heart_half.png';
        } else {
            img.src = 'assets/heart.png';
            img.style.opacity = '0.25';
        }
        bar.appendChild(img);
    }
}

function pseudoRandom(x, z, seed) {
    const val = Math.sin(x * 12.9898 + z * 78.233 + seed * 43758.5453) * 43758.5453;
    return val - Math.floor(val);
}

function getNoiseElevation(x, z, seed) {
    const e1 = Math.sin(x * 0.12 + seed) * Math.cos(z * 0.12 + seed) * 2.5;
    const e2 = Math.sin((x + z) * 0.05 + seed) * 1.5;
    const e3 = (pseudoRandom(x * 0.2, z * 0.2, seed) - 0.5) * 1.0;
    return Math.floor(e1 + e2 + e3);
}

/* PeerJS LAN Synchronization */
const PEER_CONFIG = {
    config: {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
        ]
    }
};

let peer = null;
let connections = [];
let isHost = false;
const remotePlayers = {};

function initPeer(customId = null, onReady = null) {
    try {
        peer = customId ? new Peer(customId, PEER_CONFIG) : new Peer(PEER_CONFIG);
    } catch (err) {
        document.getElementById('conn-info').textContent = "Peer initialization failed.";
        return;
    }

    peer.on('open', id => { if (onReady) onReady(id); });
    peer.on('connection', conn => setupConnection(conn));
    peer.on('error', err => {
        console.error("PeerJS Error: ", err);
        document.getElementById('conn-info').textContent = "Network Error: " + err.type;
    });
}

function setupConnection(conn) {
    connections.push(conn);
    conn.on('open', () => {
        updatePlayerCountHud();
        if (isHost) {
            conn.send({
                type: 'init-world',
                seed: activeWorld.seed,
                mods: activeWorld.mods,
                name: activeWorld.name,
                mode: activeWorld.mode,
                time: worldTime,
                weather: weatherState
            });
        }
    });
    conn.on('data', data => handleNetworkData(data, conn));
    conn.on('close', () => {
        removeRemotePlayer(conn.peer);
        connections = connections.filter(c => c !== conn);
        updatePlayerCountHud();
    });
}

function broadcast(data) {
    for (let conn of connections) {
        if (conn && conn.open) conn.send(data);
    }
}

function updatePlayerCountHud() {
    document.getElementById('hud-players').textContent = 1 + Object.keys(remotePlayers).length;
}

function addChatMessage(sender, text) {
    const cBox = document.getElementById('chat-messages');
    const msgEl = document.createElement('div');
    msgEl.innerHTML = `<span style="color:#55ffff;">&lt;${sender}&gt;</span> ${text}`;
    cBox.appendChild(msgEl);
    cBox.scrollTop = cBox.scrollHeight;
    playRandomSound(SOUNDS.chat, 0.7);
}

function handleNetworkData(data, senderConn) {
    if (data.type === 'init-world') {
        activeWorld.seed = data.seed;
        activeWorld.mods = data.mods || { overworld: {}, nether: {} };
        activeWorld.name = data.name || "Remote World";
        activeWorld.mode = data.mode || "creative";
        worldTime = data.time || 0;
        setWeather(data.weather || 'clear');
        document.getElementById('hud-world-name').textContent = activeWorld.name;
        document.getElementById('mode-indicator').textContent = activeWorld.mode.toUpperCase();
        updateHeartsDisplay();
        updateHungerDisplay();
        rebuildWorld();
    } else if (data.type === 'state') {
        updateRemoteState(data.id, data.name, data.x, data.y, data.z, data.yaw, data.heldItem, data.isDinnerbone, data.dim);
        if (isHost) {
            for (let conn of connections) {
                if (conn !== senderConn && conn.open) conn.send(data);
            }
        }
    } else if (data.type === 'chat' || data.type === 'sound') {
        if (data.type === 'chat') addChatMessage(data.sender, data.text);
        else playRandomSound(SOUNDS[data.category]);

        if (isHost) {
            for (let conn of connections) {
                if (conn !== senderConn && conn.open) conn.send(data);
            }
        }
    } else if (data.type === 'block-break') {
        activeWorld.mods[data.dim][`${data.x},${data.y},${data.z}`] = -1;
        saveWorldsToStorage();
        if (data.dim === currentDimension) applyBlockBreak(data.x, data.y, data.z, false);
        if (isHost) {
            for (let conn of connections) {
                if (conn !== senderConn && conn.open) conn.send(data);
            }
        }
    } else if (data.type === 'block-place') {
        activeWorld.mods[data.dim][`${data.x},${data.y},${data.z}`] = data.matIndex;
        saveWorldsToStorage();
        if (data.dim === currentDimension) applyBlockPlace(data.x, data.y, data.z, data.matIndex, false);
        if (isHost) {
            for (let conn of connections) {
                if (conn !== senderConn && conn.open) conn.send(data);
            }
        }
    } else if (data.type === 'time-sync' && !isHost) {
        worldTime = data.time;
    } else if (data.type === 'weather-sync' && !isHost) {
        setWeather(data.weather);
    }
}

/* Texture Management */
const textureLoader = new THREE.TextureLoader();
function loadCrisp(path) {
    const tex = textureLoader.load(path);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestMipmapNearestFilter;
    tex.generateMipmaps = true;
    return tex;
}

const TINT_R = 124 / 255, TINT_G = 189 / 255, TINT_B = 107 / 255;
const grassTopCanvas = document.createElement('canvas');
grassTopCanvas.width = 16; grassTopCanvas.height = 16;
const grassTopTexture = new THREE.CanvasTexture(grassTopCanvas);
grassTopTexture.magFilter = THREE.NearestFilter;
grassTopTexture.minFilter = THREE.NearestMipmapNearestFilter;

const grassSideCanvas = document.createElement('canvas');
grassSideCanvas.width = 16; grassSideCanvas.height = 16;
const grassSideTexture = new THREE.CanvasTexture(grassSideCanvas);
grassSideTexture.magFilter = THREE.NearestFilter;
grassSideTexture.minFilter = THREE.NearestMipmapNearestFilter;

const topImg = new Image(), overImg = new Image(), dirtImg = new Image();
let loadedImgs = 0;
function checkImages() {
    loadedImgs++;
    if (loadedImgs === 3) {
        const topCtx = grassTopCanvas.getContext('2d');
        topCtx.drawImage(topImg, 0, 0, 16, 16);
        const tData = topCtx.getImageData(0, 0, 16, 16);
        for (let i = 0; i < tData.data.length; i += 4) {
            tData.data[i] = Math.round(tData.data[i] * TINT_R);
            tData.data[i+1] = Math.round(tData.data[i+1] * TINT_G);
            tData.data[i+2] = Math.round(tData.data[i+2] * TINT_B);
        }
        topCtx.putImageData(tData, 0, 0);
        grassTopTexture.needsUpdate = true;

        const oCanvas = document.createElement('canvas');
        oCanvas.width = 16; oCanvas.height = 16;
        const oCtx = oCanvas.getContext('2d');
        oCtx.drawImage(overImg, 0, 0, 16, 16);
        const oData = oCtx.getImageData(0, 0, 16, 16);
        for (let i = 0; i < oData.data.length; i += 4) {
            oData.data[i] = Math.round(oData.data[i] * TINT_R);
            oData.data[i+1] = Math.round(oData.data[i+1] * TINT_G);
            oData.data[i+2] = Math.round(oData.data[i+2] * TINT_B);
        }
        oCtx.putImageData(oData, 0, 0);

        const sCtx = grassSideCanvas.getContext('2d');
        sCtx.drawImage(dirtImg, 0, 0, 16, 16);
        sCtx.drawImage(oCanvas, 0, 0, 16, 16);
        grassSideTexture.needsUpdate = true;
    }
}
topImg.onload = checkImages; topImg.src = 'assets/grassblock_top.png';
overImg.onload = checkImages; overImg.src = 'assets/grassblock_overlay.png';
dirtImg.onload = checkImages; dirtImg.src = 'assets/dirt.png';

const dirtMat = new THREE.MeshLambertMaterial({ map: loadCrisp('assets/dirt.png') });
const cobbleMat = new THREE.MeshLambertMaterial({ map: loadCrisp('assets/cobblestone.png') });
const leavesMat = new THREE.MeshLambertMaterial({ map: loadCrisp('assets/oak_leaves.png'), transparent: true, alphaTest: 0.2 });

const grassMat = [
    new THREE.MeshLambertMaterial({ map: grassSideTexture }),
    new THREE.MeshLambertMaterial({ map: grassSideTexture }),
    new THREE.MeshLambertMaterial({ map: grassTopTexture }),
    dirtMat,
    new THREE.MeshLambertMaterial({ map: grassSideTexture }),
    new THREE.MeshLambertMaterial({ map: grassSideTexture })
];

const oakSideTex = loadCrisp('assets/oak_log_side.png');
const oakTopTex = loadCrisp('assets/oak_log_top.png');
const oakLogMat = [
    new THREE.MeshLambertMaterial({ map: oakSideTex }),
    new THREE.MeshLambertMaterial({ map: oakSideTex }),
    new THREE.MeshLambertMaterial({ map: oakTopTex }),
    new THREE.MeshLambertMaterial({ map: oakTopTex }),
    new THREE.MeshLambertMaterial({ map: oakSideTex }),
    new THREE.MeshLambertMaterial({ map: oakSideTex })
];

const craftTop = loadCrisp('assets/crafting_table_top.png');
const craftSide = loadCrisp('assets/crafting_table_side.png');
const craftFront = loadCrisp('assets/crafting_table_front.png');
const oakPlank = loadCrisp('assets/oak_planks.png');
const craftingTableMat = [
    new THREE.MeshLambertMaterial({ map: craftSide }),
    new THREE.MeshLambertMaterial({ map: craftSide }),
    new THREE.MeshLambertMaterial({ map: craftTop }),
    new THREE.MeshLambertMaterial({ map: oakPlank }),
    new THREE.MeshLambertMaterial({ map: craftFront }),
    new THREE.MeshLambertMaterial({ map: craftSide })
];

function makeBlockMat(file, transparent = false, opacity = 1.0) {
    return new THREE.MeshLambertMaterial({ 
        map: loadCrisp('assets/' + file), 
        transparent: transparent, 
        opacity: opacity,
        alphaTest: transparent && opacity === 1.0 ? 0.2 : 0 
    });
}

/* 32-Frame Vertical Portal Texture Animation */
const portalTex = loadCrisp('assets/nether_portal.png');
portalTex.repeat.set(1, 1 / 32);
portalTex.offset.set(0, 0);

const netherPortalMat = new THREE.MeshLambertMaterial({
    map: portalTex,
    transparent: true,
    opacity: 0.85,
    side: THREE.DoubleSide
});

let portalFrame = 0;
let portalTimer = 0;
function updatePortalAnimation(delta) {
    portalTimer += delta;
    if (portalTimer >= 0.08) {
        portalTimer = 0;
        portalFrame = (portalFrame + 1) % 32;
        portalTex.offset.y = (31 - portalFrame) / 32;
    }
}

const bricksMat = makeBlockMat('bricks.png');
const obsidianMat = makeBlockMat('obsidian.png');
const netherrackMat = makeBlockMat('netherrack.png');
const netherBricksMat = makeBlockMat('nether_bricks.png');
const glowstoneMat = makeBlockMat('glowstone.png');
const soulSandMat = makeBlockMat('soul_sand.png');
const waterMat = makeBlockMat('water.png', true, 0.6);
const glassMat = makeBlockMat('glass.png', true, 0.9);
const sandMat = makeBlockMat('sand.png');
const sandstoneMat = makeBlockMat('sandstone.png');
const snowMat = makeBlockMat('snow.png');
const iceMat = makeBlockMat('ice.png', true, 0.8);

const woolColors = [
    'white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray',
    'light_gray', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black'
];

const GLOBAL_DICT = [
    { id: 0, name: 'Grass Block', type: 'block', icon: 'assets/grassblock_top.png', mat: grassMat, soundCategory: 'digGrass' },
    { id: 1, name: 'Dirt', type: 'block', icon: 'assets/dirt.png', mat: dirtMat, soundCategory: 'digGrass' },
    { id: 2, name: 'Cobblestone', type: 'block', icon: 'assets/cobblestone.png', mat: cobbleMat, soundCategory: 'digStone' },
    { id: 3, name: 'Oak Log', type: 'block', icon: 'assets/oak_log_side.png', mat: oakLogMat, soundCategory: 'digWood' },
    { id: 4, name: 'Crafting Table', type: 'block', icon: 'assets/crafting_table_front.png', mat: craftingTableMat, soundCategory: 'digWood' },
    { id: 5, name: 'Bricks', type: 'block', icon: 'assets/bricks.png', mat: bricksMat, soundCategory: 'digStone' },
    { id: 6, name: 'Obsidian', type: 'block', icon: 'assets/obsidian.png', mat: obsidianMat, soundCategory: 'digStone' },
    { id: 7, name: 'Netherrack', type: 'block', icon: 'assets/netherrack.png', mat: netherrackMat, soundCategory: 'digStone' },
    { id: 8, name: 'Nether Bricks', type: 'block', icon: 'assets/nether_bricks.png', mat: netherBricksMat, soundCategory: 'digStone' },
    { id: 9, name: 'Glowstone', type: 'block', icon: 'assets/glowstone.png', mat: glowstoneMat, soundCategory: 'digStone' },
    { id: 10, name: 'Soul Sand', type: 'block', icon: 'assets/soul_sand.png', mat: soulSandMat, soundCategory: 'digGrass' },
    { id: 11, name: 'Nether Portal', type: 'block', icon: 'assets/nether_portal.png', mat: netherPortalMat, solid: false, soundCategory: 'digStone' },
    { id: 50, name: 'Water', type: 'block', icon: 'assets/water.png', mat: waterMat, solid: false, soundCategory: 'digGrass' },
    { id: 51, name: 'Glass', type: 'block', icon: 'assets/glass.png', mat: glassMat, soundCategory: 'digStone' },
    { id: 52, name: 'Sand', type: 'block', icon: 'assets/sand.png', mat: sandMat, soundCategory: 'digGrass' },
    { id: 53, name: 'Sandstone', type: 'block', icon: 'assets/sandstone.png', mat: sandstoneMat, soundCategory: 'digStone' },
    { id: 54, name: 'Snow Block', type: 'block', icon: 'assets/snow.png', mat: snowMat, soundCategory: 'digGrass' },
    { id: 55, name: 'Ice', type: 'block', icon: 'assets/ice.png', mat: iceMat, soundCategory: 'digStone' }
];

woolColors.forEach((color, idx) => {
    GLOBAL_DICT.push({
        id: 20 + idx,
        name: color.charAt(0).toUpperCase() + color.slice(1) + ' Wool',
        type: 'block',
        icon: `assets/${color}_wool.png`,
        mat: makeBlockMat(`${color}_wool.png`),
        soundCategory: 'digGrass'
    });
});

GLOBAL_DICT.push({ id: 100, name: 'Diamond Sword', type: 'tool', icon: 'assets/diamond_sword.png', texturePath: 'assets/diamond_sword.png' });
GLOBAL_DICT.push({ id: 101, name: 'Diamond Pickaxe', type: 'tool', icon: 'assets/diamond_pickaxe.png', texturePath: 'assets/diamond_pickaxe.png' });
GLOBAL_DICT.push({ id: 102, name: 'Diamond Axe', type: 'tool', icon: 'assets/diamond_axe.png', texturePath: 'assets/diamond_axe.png' });
GLOBAL_DICT.push({ id: 103, name: 'Diamond Shovel', type: 'tool', icon: 'assets/diamond_shovel.png', texturePath: 'assets/diamond_shovel.png' });
GLOBAL_DICT.push({ id: 104, name: 'Flint and Steel', type: 'tool', icon: 'assets/flint_and_steel.png', texturePath: 'assets/flint_and_steel.png' });
GLOBAL_DICT.push({ id: 105, name: 'Stick', type: 'tool', icon: 'assets/stick.png', texturePath: 'assets/stick.png' });

// Food items
GLOBAL_DICT.push({ id: 200, name: 'Apple', type: 'food', icon: 'assets/apple.png', texturePath: 'assets/apple.png', hunger: 4, saturation: 2.4 });
GLOBAL_DICT.push({ id: 201, name: 'Bread', type: 'food', icon: 'assets/bread.png', texturePath: 'assets/bread.png', hunger: 5, saturation: 6.0 });
GLOBAL_DICT.push({ id: 202, name: 'Cooked Beef', type: 'food', icon: 'assets/cooked_beef.png', texturePath: 'assets/cooked_beef.png', hunger: 8, saturation: 12.8 });
GLOBAL_DICT.push({ id: 203, name: 'Golden Apple', type: 'food', icon: 'assets/golden_apple.png', texturePath: 'assets/golden_apple.png', hunger: 4, saturation: 9.6, special: 'regen' });
GLOBAL_DICT.push({ id: 204, name: 'Cookie', type: 'food', icon: 'assets/cookie.png', texturePath: 'assets/cookie.png', hunger: 2, saturation: 0.4 });

let hotbarSlots = [
    GLOBAL_DICT[0],
    GLOBAL_DICT[1],
    GLOBAL_DICT[2],
    GLOBAL_DICT[5],
    GLOBAL_DICT[6],
    GLOBAL_DICT.find(i => i.id === 104),
    GLOBAL_DICT.find(i => i.id === 101),
    GLOBAL_DICT.find(i => i.id === 102),
    GLOBAL_DICT.find(i => i.id === 200)
];

let selectedSlot = 0;

function renderHotbar() {
    const container = document.getElementById('hotbar-container');
    container.innerHTML = '';
    hotbarSlots.forEach((item, idx) => {
        const el = document.createElement('div');
        el.className = `slot ${idx === selectedSlot ? 'selected' : ''}`;
        el.innerHTML = `<span class="slot-key">${idx + 1}</span><img class="slot-img" src="${item.icon}" onerror="this.style.opacity='0'">`;
        el.onclick = () => selectItem(idx);
        container.appendChild(el);
    });
}

function renderInventory() {
    const grid = document.getElementById('inventory-grid');
    grid.innerHTML = '';
    GLOBAL_DICT.forEach(item => {
        const el = document.createElement('div');
        el.className = 'inv-item';
        el.title = item.name;
        el.innerHTML = `<img src="${item.icon}" onerror="this.style.opacity='0'">`;
        el.onclick = () => {
            hotbarSlots[selectedSlot] = item;
            renderHotbar();
            selectItem(selectedSlot);
            playRandomSound(SOUNDS.chat, 0.4);
        };
        grid.appendChild(el);
    });
}

/* Three.js Engine Setup */
const canvas = document.getElementById('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.shadowMap.enabled = shadowsEnabled;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x78a7ff);
scene.fog = new THREE.Fog(0x78a7ff, 25, 60);

const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.05, 140);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const sun = new THREE.DirectionalLight(0xfffaed, 0.85);
sun.position.set(25, 45, 20);
sun.castShadow = shadowsEnabled;
sun.shadow.mapSize.width = 1024;
sun.shadow.mapSize.height = 1024;
scene.add(sun);

let blockMeshMap = new Map();
let blockMap = new Map();
const boxGeom = new THREE.BoxGeometry(1, 1, 1);

function getDictItemById(id) {
    return GLOBAL_DICT.find(i => i.id === id) || GLOBAL_DICT[0];
}

function placeBlock(x, y, z, mat, solid = true, id = 0) {
    const key = `${x},${y},${z}`;
    if (blockMeshMap.has(key)) return;
    const m = new THREE.Mesh(boxGeom, mat);
    m.position.set(x, y, z);
    m.castShadow = shadowsEnabled; 
    m.receiveShadow = shadowsEnabled;
    m.userData = { isVoxel: true, x, y, z, id };
    scene.add(m);
    blockMeshMap.set(key, m);
    if (solid) blockMap.set(key, true);
}

function applyBlockBreak(x, y, z, playAudio = true) {
    const key = `${x},${y},${z}`;
    if (blockMeshMap.has(key)) {
        const m = blockMeshMap.get(key);
        const blockId = m.userData.id;
        const item = getDictItemById(blockId);
        scene.remove(m);
        blockMeshMap.delete(key);
        blockMap.delete(key);

        if (playAudio) {
            if (item.soundCategory && SOUNDS[item.soundCategory]) {
                playRandomSound(SOUNDS[item.soundCategory], 0.7);
            } else {
                playRandomSound(SOUNDS.digStone, 0.7);
            }
        }
    }
}

function applyBlockPlace(x, y, z, matIdx, playAudio = true) {
    const item = getDictItemById(matIdx);
    const isSolid = item.solid !== false;
    placeBlock(x, y, z, item.mat, isSolid, item.id);

    if (playAudio) {
        if (item.soundCategory && SOUNDS[item.soundCategory]) {
            playRandomSound(SOUNDS[item.soundCategory], 0.75);
        } else {
            playRandomSound(SOUNDS.digStone, 0.75);
        }
    }
}

function createTree(bx, by, bz) {
    const h = 4 + Math.floor(pseudoRandom(bx, bz, activeWorld.seed) * 2);
    for (let y = 0; y < h; y++) placeBlock(bx, by + y, bz, oakLogMat, true, 3);
    const topY = by + h - 1;
    for (let ly = -1; ly <= 2; ly++) {
        const r = (ly >= 1) ? 1 : 2;
        for (let lx = -r; lx <= r; lx++) {
            for (let lz = -r; lz <= r; lz++) {
                if (Math.abs(lx) === r && Math.abs(lz) === r && (pseudoRandom(bx + lx, bz + lz, activeWorld.seed) > 0.4 || ly === 2)) continue;
                if (ly <= 0 && lx === 0 && lz === 0) continue;
                placeBlock(bx + lx, topY + ly, bz + lz, leavesMat, false, 999);
            }
        }
    }
}

function switchDimension(dim = null) {
    if (dim) currentDimension = dim;
    else currentDimension = (currentDimension === "overworld") ? "nether" : "overworld";

    document.getElementById('dim-indicator').textContent = currentDimension.toUpperCase();
    document.getElementById('dim-indicator').style.color = (currentDimension === "nether") ? "#ff4444" : "#55ff55";

    playRandomSound(SOUNDS.portal, 0.85);

    if (currentDimension === "nether") {
        scene.background = new THREE.Color(0x2d0505);
        scene.fog = new THREE.Fog(0x2d0505, 10, renderRadius * 2);
        ambientLight.color.setHex(0xd23c3c);
        ambientLight.intensity = 0.45;
        sun.color.setHex(0xff7744);
        sun.intensity = 0.55;
    } else {
        scene.background = new THREE.Color(0x78a7ff);
        scene.fog = new THREE.Fog(0x78a7ff, 20, renderRadius * 3);
        ambientLight.color.setHex(0xffffff);
        ambientLight.intensity = 0.6;
        sun.color.setHex(0xfffaed);
        sun.intensity = 0.85;
    }

    rebuildWorld();
    playerGroup.position.set(0, 8, 0);
}

function rebuildWorld() {
    blockMeshMap.forEach(m => scene.remove(m));
    blockMeshMap.clear();
    blockMap.clear();

    const rad = renderRadius;
    if (currentDimension === "overworld") {
        for (let x = -rad; x <= rad; x++) {
            for (let z = -rad; z <= rad; z++) {
                if (Math.hypot(x, z) > rad) continue;
                const elev = getNoiseElevation(x, z, activeWorld.seed);
                for (let y = elev - 3; y < elev - 1; y++) placeBlock(x, y, z, cobbleMat, true, 2);
                placeBlock(x, elev - 1, z, dirtMat, true, 1);
                const isCob = pseudoRandom(x * 0.4, z * 0.4, activeWorld.seed) > 0.75;
                placeBlock(x, elev, z, isCob ? cobbleMat : grassMat, true, isCob ? 2 : 0);
                if (!isCob && pseudoRandom(x * 1.5, z * 1.5, activeWorld.seed + 12) < 0.035 && Math.abs(x) > 2 && Math.abs(z) > 2) {
                    createTree(x, elev + 1, z);
                }
            }
        }
    } else {
        const nSeed = activeWorld.seed + 54321;
        for (let x = -rad; x <= rad; x++) {
            for (let z = -rad; z <= rad; z++) {
                if (Math.hypot(x, z) > rad) continue;
                const elev = Math.floor(Math.sin(x * 0.15) * Math.cos(z * 0.15) * 3);
                const isSoulSand = pseudoRandom(x * 0.3, z * 0.3, nSeed) > 0.7;
                
                for (let y = elev - 3; y < elev; y++) placeBlock(x, y, z, netherrackMat, true, 7);
                placeBlock(x, elev, z, isSoulSand ? soulSandMat : netherrackMat, true, isSoulSand ? 10 : 7);
                for (let y = elev + 12; y <= elev + 14; y++) placeBlock(x, y, z, netherrackMat, true, 7);

                if (pseudoRandom(x * 0.4, z * 0.4, nSeed + 88) > 0.88) {
                    placeBlock(x, elev + 11, z, glowstoneMat, true, 9);
                    if (Math.random() > 0.5) placeBlock(x, elev + 10, z, glowstoneMat, true, 9);
                }
            }
        }
    }

    const mods = activeWorld.mods[currentDimension] || {};
    for (let key in mods) {
        const [x, y, z] = key.split(',').map(Number);
        const matIdx = mods[key];
        if (matIdx === -1) applyBlockBreak(x, y, z, false);
        else applyBlockPlace(x, y, z, matIdx, false);
    }
}

/* Local Player Setup */
const playerGroup = new THREE.Group();
playerGroup.position.set(0, 6, 0);
scene.add(playerGroup);

const mickeyTex = loadCrisp('assets/player_sprite.png');
const mickeyMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1.15, 1.7),
    new THREE.MeshLambertMaterial({ map: mickeyTex, transparent: true, alphaTest: 0.15, side: THREE.DoubleSide })
);
mickeyMesh.position.y = 0.85;
mickeyMesh.castShadow = shadowsEnabled;
playerGroup.add(mickeyMesh);

const handAnchor = new THREE.Group();
handAnchor.position.set(-0.35, 0.75, 0.12);
playerGroup.add(handAnchor);

let heldMesh = null;
function selectItem(idx) {
    idx = (idx + hotbarSlots.length) % hotbarSlots.length;
    selectedSlot = idx;
    renderHotbar();
    
    if (heldMesh) handAnchor.remove(heldMesh);
    
    const item = hotbarSlots[idx];
    if (item.type === 'tool' || item.type === 'food') {
        const itemTex = loadCrisp(item.texturePath);
        heldMesh = new THREE.Mesh(
            new THREE.PlaneGeometry(0.85, 0.85),
            new THREE.MeshLambertMaterial({ map: itemTex, transparent: true, alphaTest: 0.1, side: THREE.DoubleSide })
        );
        heldMesh.scale.set(1, 1, 1);
        heldMesh.position.set(0.08, 0.15, 0);
        heldMesh.rotation.set(0, 0, -0.35);
    } else {
        heldMesh = new THREE.Mesh(boxGeom, item.mat);
        heldMesh.scale.set(0.32, 0.32, 0.32);
        heldMesh.position.set(0, 0, 0);
        heldMesh.rotation.set(0.2, 0.6, 0.1);
    }
    heldMesh.castShadow = shadowsEnabled;
    handAnchor.add(heldMesh);
}

renderInventory();
selectItem(0);

function createNameTag(name) {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 64;
    const ctx = c.getContext('2d');
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(10, 10, 236, 44);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 26px "Comic Sans MS", cursive';
    ctx.textAlign = 'center';
    ctx.fillText(name, 128, 42);
    const tex = new THREE.CanvasTexture(c);
    const mat = new THREE.SpriteMaterial({ map: tex });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(1.6, 0.4, 1);
    sprite.position.y = 1.95;
    return sprite;
}

function createHeldItemMeshForRemote(itemId) {
    const item = getDictItemById(itemId);
    let mesh;
    if (item.type === 'tool' || item.type === 'food') {
        const itemTex = loadCrisp(item.texturePath);
        mesh = new THREE.Mesh(
            new THREE.PlaneGeometry(0.85, 0.85),
            new THREE.MeshLambertMaterial({ map: itemTex, transparent: true, alphaTest: 0.1, side: THREE.DoubleSide })
        );
        mesh.scale.set(0.9, 0.9, 0.9);
        mesh.position.set(0.08, 0.12, 0);
        mesh.rotation.set(0, 0, -0.35);
    } else {
        mesh = new THREE.Mesh(boxGeom, item.mat);
        mesh.scale.set(0.3, 0.3, 0.3);
        mesh.position.set(0, 0, 0);
        mesh.rotation.set(0.2, 0.6, 0.1);
    }
    return mesh;
}

function updateRemoteState(id, name, x, y, z, yaw, heldItemId, remoteDinnerbone, remoteDim) {
    if (!remotePlayers[id]) {
        const group = new THREE.Group();
        const sprite = new THREE.Mesh(
            new THREE.PlaneGeometry(1.15, 1.7),
            new THREE.MeshLambertMaterial({ map: mickeyTex, transparent: true, alphaTest: 0.15, side: THREE.DoubleSide })
        );
        sprite.position.y = 0.85;
        if (remoteDinnerbone) sprite.scale.y = -1;
        group.add(sprite);

        const remoteAnchor = new THREE.Group();
        remoteAnchor.position.set(-0.35, 0.75, 0.12);
        group.add(remoteAnchor);

        const heldMesh = createHeldItemMeshForRemote(heldItemId);
        remoteAnchor.add(heldMesh);

        const tag = createNameTag(name);
        group.add(tag);

        scene.add(group);
        remotePlayers[id] = { 
            group, sprite, remoteAnchor, heldMesh, heldId: heldItemId, name, 
            targetPos: new THREE.Vector3(x, y, z), targetYaw: yaw, isDinnerbone: remoteDinnerbone,
            dim: remoteDim
        };
        updatePlayerCountHud();
    } else {
        const rp = remotePlayers[id];
        rp.targetPos.set(x, y, z);
        rp.targetYaw = yaw;
        rp.dim = remoteDim;
        rp.group.visible = (rp.dim === currentDimension);

        if (rp.isDinnerbone !== remoteDinnerbone) {
            rp.isDinnerbone = remoteDinnerbone;
            rp.sprite.scale.y = remoteDinnerbone ? -1 : 1;
        }
        if (rp.heldId !== heldItemId) {
            rp.heldId = heldItemId;
            rp.remoteAnchor.remove(rp.heldMesh);
            rp.heldMesh = createHeldItemMeshForRemote(heldItemId);
            rp.remoteAnchor.add(rp.heldMesh);
        }
    }
}

function removeRemotePlayer(id) {
    if (remotePlayers[id]) {
        scene.remove(remotePlayers[id].group);
        delete remotePlayers[id];
    }
}

function checkAABB(x, y, z) {
    const minX = x - 0.28, maxX = x + 0.28;
    const minY = y, maxY = y + 1.65;
    const minZ = z - 0.28, maxZ = z + 0.28;
    for (let bx = Math.floor(minX + 0.5); bx <= Math.floor(maxX + 0.5); bx++) {
        for (let by = Math.floor(minY + 0.5); by <= Math.floor(maxY + 0.5); by++) {
            for (let bz = Math.floor(minZ + 0.5); bz <= Math.floor(maxZ + 0.5); bz++) {
                if (blockMap.has(`${bx},${by},${bz}`)) {
                    if (maxX > bx - 0.5 && minX < bx + 0.5 && maxY > by - 0.5 && minY < by + 0.5 && maxZ > bz - 0.5 && minZ < bz + 0.5) return true;
                }
            }
        }
    }
    return false;
}

/* Raycasting Block Placement / Interaction */
const raycaster = new THREE.Raycaster();
raycaster.far = 6.0;

function interactBlock(isPlaceAction) {
    if (!isGameStarted) return;
    
    const curItem = hotbarSlots[selectedSlot];
    
    // Food consumption
    if (!isPlaceAction && curItem.type === 'food' && activeWorld.mode === 'survival') {
        if (playerHunger < 20) {
            playerHunger = Math.min(20, playerHunger + curItem.hunger);
            playerSaturation = Math.min(20, playerSaturation + curItem.saturation);
            updateHungerDisplay();
            playRandomSound(SOUNDS.eat, 0.75);
            
            if (curItem.special === 'regen') {
                // Golden apple regeneration effect
                setTimeout(() => {
                    for (let i = 0; i < 4; i++) {
                        setTimeout(() => {
                            if (playerHealth < 20) {
                                playerHealth = Math.min(20, playerHealth + 1);
                                updateHeartsDisplay();
                            }
                        }, i * 1000);
                    }
                }, 100);
            }
        }
        return;
    }
    
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    
    const voxelMeshes = [];
    blockMeshMap.forEach(m => voxelMeshes.push(m));
    const intersects = raycaster.intersectObjects(voxelMeshes, false);

    if (intersects.length > 0) {
        const hit = intersects[0];
        const voxel = hit.object;
        const { x, y, z } = voxel.userData;

        if (!isPlaceAction) {
            activeWorld.mods[currentDimension][`${x},${y},${z}`] = -1;
            saveWorldsToStorage();
            applyBlockBreak(x, y, z);
            broadcast({ type: 'block-break', x, y, z, dim: currentDimension });
        } else {
            if (curItem.id === 104) {
                // Flint & Steel
                const normal = hit.face.normal;
                const placeX = Math.round(x + normal.x);
                const placeY = Math.round(y + normal.y);
                const placeZ = Math.round(z + normal.z);
                activeWorld.mods[currentDimension][`${placeX},${placeY},${placeZ}`] = 11;
                saveWorldsToStorage();
                applyBlockPlace(placeX, placeY, placeZ, 11);
                broadcast({ type: 'block-place', x: placeX, y: placeY, z: placeZ, matIndex: 11, dim: currentDimension });
                playRandomSound(SOUNDS.fizz, 0.85);
                return;
            }

            if (curItem.type === 'tool' || curItem.type === 'food') return;

            const normal = hit.face.normal;
            const placeX = Math.round(x + normal.x);
            const placeY = Math.round(y + normal.y);
            const placeZ = Math.round(z + normal.z);

            const px = playerGroup.position.x, py = playerGroup.position.y, pz = playerGroup.position.z;
            if (curItem.solid !== false && Math.abs(placeX - px) < 0.75 && Math.abs(placeZ - pz) < 0.75 && placeY >= Math.floor(py) && placeY <= Math.ceil(py + 1.5)) {
                return;
            }

            activeWorld.mods[currentDimension][`${placeX},${placeY},${placeZ}`] = curItem.id;
            saveWorldsToStorage();
            applyBlockPlace(placeX, placeY, placeZ, curItem.id);
            broadcast({ type: 'block-place', x: placeX, y: placeY, z: placeZ, matIndex: curItem.id, dim: currentDimension });
        }
    }
}

/* Controls & UI Listeners */
const keys = {};
let isChatActive = false, isInvOpen = false, isWorldOpen = false;
let yaw = 0, pitch = 0.25;
let perspective = 'third';

function isInputFocused() {
    const active = document.activeElement;
    return active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA');
}

function toggleInventory() {
    isInvOpen = !isInvOpen;
    document.getElementById('inventory-modal').style.display = isInvOpen ? 'flex' : 'none';
    if (isInvOpen && document.pointerLockElement) document.exitPointerLock();
    else if (!isInvOpen && !isChatActive && !isWorldOpen && isGameStarted) canvas.requestPointerLock();
}

function toggleWorldMenu() {
    isWorldOpen = !isWorldOpen;
    document.getElementById('world-modal').style.display = isWorldOpen ? 'flex' : 'none';
    if (isWorldOpen) renderWorldList();
}

document.getElementById('close-inv-btn').onclick = toggleInventory;
document.getElementById('worlds-menu-btn').onclick = toggleWorldMenu;
document.getElementById('close-world-btn').onclick = toggleWorldMenu;

// Weather control buttons
document.getElementById('weather-clear-btn').onclick = () => {
    setWeather('clear');
    if (isHost) broadcast({ type: 'weather-sync', weather: 'clear' });
};

document.getElementById('weather-rain-btn').onclick = () => {
    setWeather('rain');
    if (isHost) broadcast({ type: 'weather-sync', weather: 'rain' });
};

document.getElementById('weather-storm-btn').onclick = () => {
    setWeather('storm');
    if (isHost) broadcast({ type: 'weather-sync', weather: 'storm' });
};

// Time control buttons
document.getElementById('time-day-btn').onclick = () => {
    worldTime = 6000;
    if (isHost) broadcast({ type: 'time-sync', time: worldTime });
};

document.getElementById('time-night-btn').onclick = () => {
    worldTime = 18000;
    if (isHost) broadcast({ type: 'time-sync', time: worldTime });
};

function renderWorldList() {
    const listEl = document.getElementById('world-list');
    listEl.innerHTML = '';
    for (let id in savedWorlds) {
        const w = savedWorlds[id];
        const entry = document.createElement('div');
        entry.className = `world-entry ${id === activeWorldId ? 'active' : ''}`;
        entry.innerHTML = `
            <div>
                <b>${w.name}</b> <small style="color:#aaa;">[${w.mode.toUpperCase()}]</small>
            </div>
            <div>
                <button class="world-entry-btn" onclick="event.stopPropagation(); deleteWorld('${id}')">Delete</button>
            </div>
        `;
        entry.onclick = () => {
            activeWorldId = id;
            activeWorld = savedWorlds[id];
            renderWorldList();
        };
        listEl.appendChild(entry);
    }
}

window.deleteWorld = function(id) {
    if (Object.keys(savedWorlds).length <= 1) {
        alert("Cannot delete the only remaining world!");
        return;
    }
    delete savedWorlds[id];
    saveWorldsToStorage();
    activeWorldId = Object.keys(savedWorlds)[0];
    activeWorld = savedWorlds[activeWorldId];
    renderWorldList();
};

document.getElementById('create-world-btn').onclick = () => {
    const name = document.getElementById('new-world-name').value.trim() || "New World";
    const mode = document.getElementById('new-world-mode').value;
    const id = "world_" + Date.now();
    savedWorlds[id] = {
        id,
        name,
        mode,
        seed: Math.floor(Math.random() * 99999),
        mods: { overworld: {}, nether: {} },
        spawnPoint: { x: 0, y: 8, z: 0 },
        time: 0,
        weather: 'clear'
    };
    saveWorldsToStorage();
    activeWorldId = id;
    activeWorld = savedWorlds[id];
    renderWorldList();
};

document.getElementById('render-dist-select').onchange = (e) => {
    renderRadius = parseInt(e.target.value);
    if (isGameStarted) rebuildWorld();
};

document.getElementById('shadow-select').onchange = (e) => {
    shadowsEnabled = (e.target.value === 'on');
    renderer.shadowMap.enabled = shadowsEnabled;
    sun.castShadow = shadowsEnabled;
    mickeyMesh.castShadow = shadowsEnabled;
    blockMeshMap.forEach(m => {
        m.castShadow = shadowsEnabled;
        m.receiveShadow = shadowsEnabled;
    });
};

window.addEventListener('keydown', e => {
    if (isInputFocused()) {
        if (e.code === 'Enter' && isChatActive) {
            const txt = document.getElementById('chat-input').value.trim();
            if (txt) {
                addChatMessage(myPlayerName, txt);
                broadcast({ type: 'chat', sender: myPlayerName, text: txt });
                document.getElementById('chat-input').value = '';
            }
            document.activeElement.blur();
            isChatActive = false;
            canvas.requestPointerLock();
        } else if (e.code === 'Escape') {
            document.activeElement.blur();
            isChatActive = false;
            canvas.requestPointerLock();
        }
        return;
    }

    if (isInvOpen) {
        if (e.code === 'Escape' || e.code === 'KeyE') toggleInventory();
        return;
    }
    if (isWorldOpen) {
        if (e.code === 'Escape') toggleWorldMenu();
        return;
    }

    if (!isGameStarted && (e.code === 'Space' || e.code === 'Enter')) { startSinglePlayer(); return; }

    if (e.code === 'KeyT' || e.code === 'Enter') {
        e.preventDefault();
        isChatActive = true;
        if (document.pointerLockElement) document.exitPointerLock();
        document.getElementById('chat-input').focus();
        return;
    }

    if (e.code === 'KeyE') {
        e.preventDefault();
        toggleInventory();
        return;
    }

    if (e.code === 'KeyN') {
        switchDimension();
        return;
    }

    if (e.code === 'KeyV') {
        perspective = (perspective === 'third') ? 'first' : 'third';
        mickeyMesh.visible = (perspective === 'third');
        return;
    }
    
    if (e.code === 'KeyF') {
        e.preventDefault();
        if (isHost) {
            // Cycle weather
            if (weatherState === 'clear') setWeather('rain');
            else if (weatherState === 'rain') setWeather('storm');
            else setWeather('clear');
            broadcast({ type: 'weather-sync', weather: weatherState });
        }
        return;
    }

    keys[e.code] = true;
    if (['Digit1','Digit2','Digit3','Digit4','Digit5','Digit6','Digit7','Digit8','Digit9'].includes(e.code)) {
        selectItem(parseInt(e.key) - 1);
        playRandomSound(SOUNDS.chat, 0.4);
    }
});

window.addEventListener('keyup', e => {
    if (!isInputFocused()) keys[e.code] = false;
});

canvas.addEventListener('mousedown', e => {
    if (isInvOpen || isChatActive || isWorldOpen) return;
    if (document.pointerLockElement !== canvas) {
        canvas.requestPointerLock();
        return;
    }
    if (e.button === 0) interactBlock(false);
    else if (e.button === 2) interactBlock(true);
});

window.addEventListener('contextmenu', e => e.preventDefault());

window.addEventListener('mousemove', e => {
    if (isInvOpen || isChatActive || isWorldOpen || !isGameStarted) return;
    if (document.pointerLockElement === canvas) {
        yaw -= e.movementX * 0.004;
        pitch = Math.max(-1.4, Math.min(1.4, pitch + e.movementY * 0.004));
    }
});

/* Controller Engine */
let controllerIndex = null;
let prevPad = {};

window.addEventListener('gamepadconnected', e => {
    controllerIndex = e.gamepad.index;
    document.getElementById('controller-status').textContent = 'Connected (' + e.gamepad.id.slice(0, 10) + ')';
});

window.addEventListener('gamepaddisconnected', () => {
    controllerIndex = null;
    document.getElementById('controller-status').textContent = 'None';
});

function deadzone(v) { return Math.abs(v) > 0.16 ? v : 0; }

function checkDinnerboneName(name) {
    isDinnerbone = (name.trim().toLowerCase() === 'dinnerbone');
    mickeyMesh.scale.y = isDinnerbone ? -1 : 1;
}

function enterGame() {
    isGameStarted = true;
    checkDinnerboneName(myPlayerName);
    document.getElementById('title-screen').style.display = 'none';
    document.getElementById('hud').style.display = 'block';
    document.getElementById('crosshair').style.display = 'block';
    document.getElementById('hotbar-container').style.display = 'flex';
    document.getElementById('chat-window').style.display = 'flex';
    document.getElementById('hud-world-name').textContent = activeWorld.name;
    document.getElementById('mode-indicator').textContent = activeWorld.mode.toUpperCase();
    
    if (activeWorld.mode === 'survival') {
        playerHealth = 20;
        playerHunger = 20;
        playerSaturation = 5.0;
        playerOxygen = 20;
    }
    
    updateHeartsDisplay();
    updateHungerDisplay();
    rebuildWorld();
    setWeather(activeWorld.weather || 'clear');
    bgmAudio.play().catch(() => {});
    canvas.requestPointerLock();
}

function startSinglePlayer() {
    myPlayerName = document.getElementById('player-name').value.trim() || "Mickey";
    enterGame();
}

document.getElementById('single-btn').addEventListener('click', startSinglePlayer);

document.getElementById('host-btn').addEventListener('click', () => {
    myPlayerName = document.getElementById('player-name').value.trim() || "MickeyHost";
    const genId = 'mick-' + Math.floor(1000 + Math.random() * 9000);
    document.getElementById('conn-info').textContent = "Connecting to signaling server...";
    initPeer(genId, id => {
        isHost = true;
        document.getElementById('conn-info').textContent = `Host Room Code: ${id}`;
        document.getElementById('hud-room').textContent = id;
        enterGame();
    });
});

document.getElementById('join-btn').addEventListener('click', () => {
    const hostId = document.getElementById('join-id-input').value.trim();
    if (!hostId) return alert('Enter Host Room ID');
    myPlayerName = document.getElementById('player-name').value.trim() || "MickeyGuest";
    document.getElementById('conn-info').textContent = "Joining host " + hostId + "...";
    initPeer(null, () => {
        const conn = peer.connect(hostId);
        setupConnection(conn);
        document.getElementById('hud-room').textContent = hostId;
        enterGame();
    });
});

/* Main Game Loop */
let lastTime = performance.now(), velY = 0, isGrounded = false, walkBob = 0, lastNetSync = 0;
let inPortalCooldown = 0;
let stepAudioTimer = 0;

function animate() {
    requestAnimationFrame(animate);
    const now = performance.now();
    const delta = Math.min((now - lastTime) / 1000, 0.1);
    lastTime = now;

    updatePortalAnimation(delta);
    updateDayNightCycle(delta);
    updateWeatherParticles(delta);
    
    if (activeWorld.mode === 'survival') {
        updateHunger(delta);
        updateOxygen(delta);
    }

    if (inPortalCooldown > 0) inPortalCooldown -= delta;

    for (let id in remotePlayers) {
        const rp = remotePlayers[id];
        rp.group.position.lerp(rp.targetPos, 0.25);
        rp.sprite.rotation.y = rp.targetYaw;
        rp.remoteAnchor.rotation.y = rp.targetYaw;
    }

    let padX = 0, padZ = 0, padJump = false;
    if (controllerIndex !== null) {
        const gp = (navigator.getGamepads ? navigator.getGamepads() : [])[controllerIndex];
        if (gp) {
            if (!isGameStarted && (gp.buttons[0]?.pressed || gp.buttons[9]?.pressed)) startSinglePlayer();

            padX = deadzone(gp.axes[0]);
            padZ = deadzone(gp.axes[1]);

            const rx = deadzone(gp.axes[2]);
            const ry = deadzone(gp.axes[3]);
            yaw -= rx * delta * 3.4;
            pitch = Math.max(-1.4, Math.min(1.4, pitch + ry * delta * 2.6));

            if (gp.buttons[0]?.pressed) padJump = true;

            const lb = gp.buttons[4]?.pressed;
            const rb = gp.buttons[5]?.pressed;
            if (lb && !prevPad.lb) selectItem(selectedSlot - 1);
            if (rb && !prevPad.rb) selectItem(selectedSlot + 1);

            const rt = gp.buttons[7]?.pressed;
            const lt = gp.buttons[6]?.pressed;
            if (rt && !prevPad.rt) interactBlock(false);
            if (lt && !prevPad.lt) interactBlock(true);

            const yBtn = gp.buttons[3]?.pressed;
            if (yBtn && !prevPad.yBtn) toggleInventory();

            prevPad = { lb, rb, rt, lt, yBtn };
        }
    }

    if (!isGameStarted) {
        yaw += delta * 0.15;
        camera.position.set(playerGroup.position.x + Math.sin(yaw) * 6.5, playerGroup.position.y + 2.5, playerGroup.position.z + Math.cos(yaw) * 6.5);
        camera.lookAt(playerGroup.position.x, playerGroup.position.y + 1.0, playerGroup.position.z);
        renderer.render(scene, camera);
        return;
    }

    if (!isInputFocused() && !isInvOpen && !isWorldOpen) {
        const camRotSpeed = 2.4 * delta;
        if (keys['ArrowLeft'])  yaw += camRotSpeed;
        if (keys['ArrowRight']) yaw -= camRotSpeed;
        if (keys['ArrowUp'])    pitch = Math.max(-1.4, pitch - camRotSpeed);
        if (keys['ArrowDown'])  pitch = Math.min(1.4, pitch + camRotSpeed);
    }

    const camF = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)).normalize();
    const camR = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)).normalize();
    const mDir = new THREE.Vector3();

    if (!isInputFocused() && !isInvOpen && !isWorldOpen) {
        if (keys['KeyW']) mDir.add(camF);
        if (keys['KeyS']) mDir.sub(camF);
        if (keys['KeyD']) mDir.add(camR);
        if (keys['KeyA']) mDir.sub(camR);
    }

    if (padX || padZ) {
        mDir.addScaledVector(camR, padX);
        mDir.addScaledVector(camF, -padZ);
    }

    const moving = mDir.lengthSq() > 0.001;
    if (moving) {
        mDir.normalize();
        walkBob += delta * 12;

        if (isGrounded) {
            stepAudioTimer += delta;
            if (stepAudioTimer >= 0.38) {
                stepAudioTimer = 0;
                playRandomSound(currentDimension === 'nether' ? SOUNDS.digStone : SOUNDS.digGrass, 0.45);
            }
        }
    } else {
        walkBob = 0;
        stepAudioTimer = 0.2;
    }

    let cx = playerGroup.position.x, cy = playerGroup.position.y, cz = playerGroup.position.z;
    const dx = mDir.x * 6.2 * delta, dz = mDir.z * 6.2 * delta;

    function stepMove(nx, nz) {
        if (!checkAABB(nx, cy, nz)) { cx = nx; cz = nz; return; }
        if (isGrounded) {
            const sy = cy + 0.6;
            if (!checkAABB(cx, sy, cz) && !checkAABB(nx, sy, nz)) { cx = nx; cz = nz; cy = sy; return; }
        }
        if (!checkAABB(nx, cy, cz)) { cx = nx; return; }
        if (!checkAABB(cx, cy, nz)) { cz = nz; return; }
    }
    if (dx || dz) stepMove(cx + dx, cz + dz);

    velY -= 28 * delta;
    if (isGrounded && !isInputFocused() && !isInvOpen && !isWorldOpen && (keys['Space'] || padJump)) {
        velY = 10.5;
        isGrounded = false;
        playRandomSound(SOUNDS.jump, 0.8);
        broadcast({ type: 'sound', category: 'jump' });
    }

    let ny = cy + velY * delta;
    if (velY < 0) {
        if (checkAABB(cx, ny, cz)) {
            if (velY < -15) {
                playRandomSound(SOUNDS.fallBig, 0.8);
                
                if (activeWorld.mode === 'survival') {
                    playRandomSound(SOUNDS.hurt, 0.8);
                    broadcast({ type: 'sound', category: 'hurt' });
                    const dmg = Math.floor(Math.abs(velY + 14) * 0.7);
                    playerHealth = Math.max(0, playerHealth - dmg);
                    updateHeartsDisplay();

                    if (playerHealth <= 0) {
                        playRandomSound(SOUNDS.die, 0.9);
                        cx = 0; cy = 8; cz = 0; velY = 0;
                        playerHealth = 20;
                        playerHunger = 20;
                        playerSaturation = 5.0;
                        updateHeartsDisplay();
                        updateHungerDisplay();
                    }
                }
            }
            cy = Math.floor(ny + 0.5) + 0.5;
            velY = 0; isGrounded = true;
        } else { cy = ny; isGrounded = false; }
    } else if (velY > 0) {
        if (checkAABB(cx, ny, cz)) velY = 0;
        else { cy = ny; isGrounded = false; }
    }

    // Portal detection
    const standingBlockKey = `${Math.round(cx)},${Math.round(cy + 0.5)},${Math.round(cz)}`;
    const blockInPlayer = blockMeshMap.get(standingBlockKey);
    if (blockInPlayer && blockInPlayer.userData.id === 11 && inPortalCooldown <= 0) {
        inPortalCooldown = 3.5;
        switchDimension();
        return;
    }

    if (cy < -18) {
        playRandomSound(SOUNDS.die, 0.85);
        broadcast({ type: 'sound', category: 'die' });
        cx = 0; cy = 8; cz = 0; velY = 0;
        if (activeWorld.mode === 'survival') {
            playerHealth = 20;
            playerHunger = 20;
            playerSaturation = 5.0;
            updateHeartsDisplay();
            updateHungerDisplay();
        }
    }
    playerGroup.position.set(cx, cy, cz);

    mickeyMesh.rotation.y = yaw;
    if (moving) {
        const dot = mDir.dot(camR);
        const inv = isDinnerbone ? -1 : 1;
        if (dot > 0.25) mickeyMesh.scale.x = -1 * inv;
        else if (dot < -0.25) mickeyMesh.scale.x = 1 * inv;
    }

    handAnchor.rotation.y = yaw;
    handAnchor.position.set(
        -0.35 * Math.cos(yaw) + (moving ? Math.cos(walkBob) * 0.03 : 0),
        0.75 + (moving ? Math.sin(walkBob) * 0.05 : 0),
        0.35 * Math.sin(yaw)
    );

    if (perspective === 'first') {
        camera.position.set(cx, cy + 1.45 + (moving ? Math.sin(walkBob) * 0.04 : 0), cz);
        camera.lookAt(new THREE.Vector3(
            cx - Math.sin(yaw) * Math.cos(pitch) * 10,
            cy + 1.45 - Math.sin(pitch) * 10,
            cz - Math.cos(yaw) * Math.cos(pitch) * 10
        ));
    } else {
        camera.position.lerp(new THREE.Vector3(
            cx + Math.sin(yaw) * Math.cos(pitch) * 5.2,
            cy + 1.25 + Math.sin(pitch) * 5.2,
            cz + Math.cos(yaw) * Math.cos(pitch) * 5.2
        ), 0.25);
        camera.lookAt(cx, cy + 1.1, cz);
    }

    if (peer && now - lastNetSync > 45) {
        lastNetSync = now;
        broadcast({
            type: 'state', id: peer.id, name: myPlayerName,
            x: cx, y: cy, z: cz, yaw: yaw,
            heldItem: hotbarSlots[selectedSlot].id,
            isDinnerbone: isDinnerbone,
            dim: currentDimension
        });
    }

    renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();