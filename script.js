const gridElement = document.getElementById('grid');
const statusMessage = document.getElementById('status-message');
const playerScoreEl = document.getElementById('player-match-score');
const aiScoreEl = document.getElementById('ai-match-score');
const difficultySelect = document.getElementById('difficulty');
const moveBtns = document.querySelectorAll('.move-btn');
const wildCardBtn = document.getElementById('wild-card-btn');
const wildCardCountEl = document.getElementById('wild-card-count');
const controlsEl = document.querySelector('.controls');
const modal = document.getElementById('game-over-modal');
const modalTitle = document.getElementById('modal-title');
const modalMessage = document.getElementById('modal-message');
const nextGridBtn = document.getElementById('next-grid-btn');
const aiAvatarEl = document.getElementById('ai-avatar');
const aiLabelEl = document.getElementById('ai-label');

let grid = Array(9).fill(null); // { owner: 'player'|'ai', move: str, isPower: bool }
let playerScore = 0;
let aiScore = 0;
let playerWildCards = 0;
let aiWildCards = 0;

let currentRound = 1;
let currentPhase = 'select-cell'; // 'select-cell' | 'select-move'
let currentTurn = 'player'; // 'player' | 'ai'
let selectedCellIndex = null;
let useWildCardNext = false;
let playerStreak = 0;
let aiStreak = 0;

// Audio Context
let audioCtx = null;
function initAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
}
function playSound(type) {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();
  osc.connect(gainNode);
  gainNode.connect(audioCtx.destination);
  const now = audioCtx.currentTime;
  if (type === 'tick') {
    osc.type = 'triangle'; osc.frequency.setValueAtTime(800, now); osc.frequency.exponentialRampToValueAtTime(100, now + 0.1);
    gainNode.gain.setValueAtTime(0.3, now); gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
    osc.start(now); osc.stop(now + 0.1);
  } else if (type === 'clash') {
    osc.type = 'sawtooth'; osc.frequency.setValueAtTime(150, now); osc.frequency.exponentialRampToValueAtTime(50, now + 0.3);
    gainNode.gain.setValueAtTime(0.5, now); gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
    osc.start(now); osc.stop(now + 0.3);
  } else if (type === 'win') {
    osc.type = 'sine'; osc.frequency.setValueAtTime(440, now); osc.frequency.setValueAtTime(554.37, now + 0.1); osc.frequency.setValueAtTime(659.25, now + 0.2);
    gainNode.gain.setValueAtTime(0.3, now); gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
    osc.start(now); osc.stop(now + 0.5);
  }
}

// Statistics for Hard Mode
let playerHistory = { rock: 0, paper: 0, scissors: 0 };

const MOVES = {
  rock: { beats: 'scissors', icon: '⛰️', hand: '✊' },
  paper: { beats: 'rock', icon: '📄', hand: '✋' },
  scissors: { beats: 'paper', icon: '✂️', hand: '✌️' },
  wildcard: { beats: ['rock', 'paper', 'scissors'], icon: '⚡', hand: '⚡' }
};

const WIN_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // cols
  [0, 4, 8], [2, 4, 6]             // diagonals
];

// Initialization
function initGrid() {
  gridElement.innerHTML = '';
  for (let i = 0; i < 9; i++) {
    const cell = document.createElement('div');
    cell.classList.add('cell');
    cell.dataset.index = i;
    cell.addEventListener('click', handleCellClick);
    gridElement.appendChild(cell);
  }
}

function resetGame() {
  grid = Array(9).fill(null);
  currentRound = 1;
  currentTurn = 'player';
  currentPhase = 'select-cell';
  selectedCellIndex = null;
  useWildCardNext = false;
  playerStreak = 0;
  aiStreak = 0;
  gridElement.classList.remove('on-fire-player', 'on-fire');
  wildCardBtn.classList.remove('active');
  
  modal.classList.add('hidden');
  initGrid();
  updateUI();
  updateStatus();
}

function fullReset() {
  playerScore = 0;
  aiScore = 0;
  playerWildCards = 0;
  aiWildCards = 0;
  playerHistory = { rock: 0, paper: 0, scissors: 0 };
  playerScoreEl.textContent = '0';
  aiScoreEl.textContent = '0';
  resetGame();
}

function updateUI() {
  Array.from(gridElement.children).forEach((cellEl, i) => {
    const cellData = grid[i];
    cellEl.className = 'cell'; // reset classes
    cellEl.innerHTML = '';

    if (i === selectedCellIndex) {
      cellEl.classList.add('selected');
    }

    if (cellData) {
      if (cellData.isPower) {
        cellEl.classList.add('power-cell');
      }
      
      if (cellData.owner) {
        cellEl.classList.add(cellData.owner);
        cellEl.innerHTML = MOVES[cellData.move].icon;
        cellEl.classList.remove('selected', 'power-cell'); // reset if claimed
      }
    }
  });

  wildCardCountEl.textContent = playerWildCards;
  wildCardBtn.disabled = playerWildCards === 0;

  if (currentPhase === 'select-move') {
    controlsEl.classList.remove('disabled');
  } else {
    controlsEl.classList.add('disabled');
  }
}

function updateStatus() {
  if (currentPhase === 'select-cell') {
    if (currentTurn === 'player') {
      statusMessage.textContent = 'Your turn: Select an empty cell!';
    } else {
      statusMessage.textContent = 'AI is choosing a cell...';
    }
  } else if (currentPhase === 'select-move') {
    if (currentTurn === 'player') {
      statusMessage.textContent = 'You selected a cell. Choose your move!';
    } else {
      statusMessage.textContent = 'AI wants this cell. Defend it! Choose your move.';
    }
  }
}

function spawnPowerCell() {
  const emptyIndices = grid.map((val, i) => val === null ? i : null).filter(val => val !== null);
  if (emptyIndices.length > 0) {
    const rIndex = emptyIndices[Math.floor(Math.random() * emptyIndices.length)];
    grid[rIndex] = { isPower: true, owner: null, move: null };
  }
}

function handleCellClick(e) {
  initAudio();
  if (currentPhase !== 'select-cell' || currentTurn !== 'player') return;
  const index = parseInt(e.target.dataset.index);
  
  // Can only select empty cells
  if (grid[index] && grid[index].owner) return;

  selectedCellIndex = index;
  currentPhase = 'select-move';
  updateUI();
  updateStatus();
}

moveBtns.forEach(btn => {
  btn.addEventListener('click', (e) => {
    if (currentPhase !== 'select-move') return;
    const move = btn.dataset.move;
    
    let finalMove = move;
    if (useWildCardNext) {
      finalMove = 'wildcard';
      playerWildCards--;
      useWildCardNext = false;
      wildCardBtn.classList.remove('active');
    }
    
    if (finalMove !== 'wildcard') {
      playerHistory[finalMove]++;
    }

    resolveRound(finalMove);
  });
});

difficultySelect.addEventListener('change', (e) => {
  const diff = e.target.value;
  if(diff === 'easy') { aiAvatarEl.textContent = '🤖'; aiLabelEl.textContent = 'AI (Easy)'; }
  if(diff === 'medium') { aiAvatarEl.textContent = '🧠'; aiLabelEl.textContent = 'AI (Medium)'; }
  if(diff === 'hard') { aiAvatarEl.textContent = '🥷'; aiLabelEl.textContent = 'AI (Hard)'; }
});

wildCardBtn.addEventListener('click', () => {
  if (playerWildCards > 0 && currentPhase === 'select-move') {
    useWildCardNext = !useWildCardNext;
    wildCardBtn.classList.toggle('active');
  }
});

// AI Logic
function aiTurnCellSelection() {
  setTimeout(() => {
    const diff = difficultySelect.value;
    let selected = null;
    const emptyIndices = grid.map((val, i) => (!val || !val.owner) ? i : null).filter(val => val !== null);

    if (diff === 'easy') {
      selected = emptyIndices[Math.floor(Math.random() * emptyIndices.length)];
    } else {
      selected = getBestCell(emptyIndices);
    }

    selectedCellIndex = selected;
    currentPhase = 'select-move';
    updateUI();
    updateStatus();
  }, 1000);
}

function getBestCell(emptyIndices) {
  // 1. Can AI win?
  for (let i of emptyIndices) {
    grid[i] = { owner: 'ai' };
    if (checkWin('ai')) { grid[i] = null; return i; }
    grid[i] = null; // revert
  }
  // 2. Can Player win? Block it.
  for (let i of emptyIndices) {
    grid[i] = { owner: 'player' };
    if (checkWin('player')) { grid[i] = null; return i; }
    grid[i] = null;
  }
  // 3. Power cell active?
  const powerIdx = grid.findIndex(c => c && c.isPower && !c.owner);
  if (powerIdx !== -1) return powerIdx;

  // 4. Center
  if (emptyIndices.includes(4)) return 4;
  
  // 5. Random
  return emptyIndices[Math.floor(Math.random() * emptyIndices.length)];
}

function getAIMove() {
  const diff = difficultySelect.value;
  const standardMoves = ['rock', 'paper', 'scissors'];
  let move = standardMoves[Math.floor(Math.random() * standardMoves.length)];

  const isCritical = isCellCritical(selectedCellIndex);
  
  if (diff === 'hard') {
    // Smart probability based on player history
    const total = playerHistory.rock + playerHistory.paper + playerHistory.scissors;
    if (total > 0) {
      let r = Math.random();
      if (r < playerHistory.rock / total) move = 'paper';
      else if (r < (playerHistory.rock + playerHistory.paper) / total) move = 'scissors';
      else move = 'rock';
    }
    
    // Use Wildcard?
    if (aiWildCards > 0 && isCritical) {
      aiWildCards--;
      return 'wildcard';
    }
  } else if (diff === 'medium') {
    if (aiWildCards > 0 && isCritical && Math.random() > 0.5) {
      aiWildCards--;
      return 'wildcard';
    }
  }

  return move;
}

function isCellCritical(idx) {
  // Critical if gives someone a win or is a power cell
  if (grid[idx] && grid[idx].isPower) return true;
  grid[idx] = { owner: 'player' }; let pw = checkWin('player');
  grid[idx] = { owner: 'ai' }; let aw = checkWin('ai');
  grid[idx] = null;
  return pw || aw;
}

let battleTimerInterval = null;

function resolveRound(playerMove) {
  const aiMove = getAIMove();
  
  controlsEl.classList.add('disabled');
  statusMessage.textContent = "BATTLE!";
  
  const arena = document.getElementById('battle-arena');
  const playerIcon = document.getElementById('player-hand-icon');
  const aiIcon = document.getElementById('ai-hand-icon');
  const timerEl = document.getElementById('battle-timer');
  const pHand = document.getElementById('player-hand');
  const aHand = document.getElementById('ai-hand');
  
  arena.classList.add('active');
  pHand.classList.add('shake');
  aHand.classList.add('shake');
  
  playerIcon.textContent = '✊';
  aiIcon.textContent = '✊';
  
  let count = 5;
  timerEl.textContent = count;
  playSound('tick');
  
  battleTimerInterval = setInterval(() => {
    count--;
    if (count > 0) {
      playSound('tick');
      timerEl.textContent = count;
    } else {
      playSound('clash');
      clearInterval(battleTimerInterval);
      timerEl.textContent = "SHOOT!";
      
      pHand.classList.remove('shake');
      aHand.classList.remove('shake');
      
      playerIcon.textContent = MOVES[playerMove].hand;
      aiIcon.textContent = MOVES[aiMove].hand;
      
      setTimeout(() => {
        arena.classList.remove('active');
        finalizeRound(playerMove, aiMove);
      }, 1500);
    }
  }, 500);
}

function finalizeRound(playerMove, aiMove) {
  let winner = null;
  
  if (playerMove === aiMove) {
    winner = 'tie';
  } else if (playerMove === 'wildcard') {
    winner = 'player';
  } else if (aiMove === 'wildcard') {
    winner = 'ai';
  } else if (MOVES[playerMove].beats === aiMove) {
    winner = 'player';
  } else {
    winner = 'ai';
  }

  let logMsg = `You played ${MOVES[playerMove].icon}, AI played ${MOVES[aiMove].icon}. `;
  
  if (winner === 'tie') {
    playerStreak = 0; aiStreak = 0;
    logMsg += "It's a tie! Cell remains empty.";
    grid[selectedCellIndex] = null; // resets power cell too if it was tied
  } else {
    if (winner === 'player') { 
        playerStreak++; aiStreak = 0; 
        playSound('win');
        if (typeof confetti !== 'undefined') confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
    } else { 
        aiStreak++; playerStreak = 0; 
    }
    
    logMsg += `${winner === 'player' ? 'You' : 'AI'} claim the cell!`;
    const wasPower = grid[selectedCellIndex] && grid[selectedCellIndex].isPower;
    grid[selectedCellIndex] = { owner: winner, move: winner === 'player' ? playerMove : aiMove };
    
    if (wasPower) {
      if (winner === 'player') playerWildCards++;
      else aiWildCards++;
      logMsg += " ⚡ Wild Card earned!";
    }
  }
  
  if (playerStreak >= 2) {
      gridElement.classList.add('on-fire-player');
      gridElement.classList.remove('on-fire');
  } else if (aiStreak >= 2) {
      gridElement.classList.add('on-fire');
      gridElement.classList.remove('on-fire-player');
  } else {
      gridElement.classList.remove('on-fire-player', 'on-fire');
  }

  statusMessage.textContent = logMsg;
  selectedCellIndex = null;
  currentPhase = 'select-cell';
  currentRound++;

  updateUI();

  // Check board state
  setTimeout(() => {
    if (checkWin('player')) {
      endGrid('player');
    } else if (checkWin('ai')) {
      endGrid('ai');
    } else if (isBoardFull()) {
      endGrid('draw');
    } else {
      // Continue game
      if (currentRound % 3 === 0) {
        spawnPowerCell();
        updateUI();
      }
      
      currentTurn = currentTurn === 'player' ? 'ai' : 'player';
      updateStatus();
      if (currentTurn === 'ai') {
        aiTurnCellSelection();
      }
    }
  }, 1500);
}

function checkWin(owner) {
  for (let line of WIN_LINES) {
    if (grid[line[0]]?.owner === owner &&
        grid[line[1]]?.owner === owner &&
        grid[line[2]]?.owner === owner) {
      return true;
    }
  }
  return false;
}

function isBoardFull() {
  return grid.every(cell => cell && cell.owner);
}

function endGrid(result) {
  if (result === 'player') {
    playerScore++;
    playerScoreEl.textContent = playerScore;
    modalTitle.textContent = "You won the grid!";
    modalTitle.style.color = 'var(--player-color)';
    modalMessage.textContent = "You got 3 in a row.";
  } else if (result === 'ai') {
    aiScore++;
    aiScoreEl.textContent = aiScore;
    modalTitle.textContent = "AI won the grid!";
    modalTitle.style.color = 'var(--ai-color)';
    modalMessage.textContent = "AI got 3 in a row.";
  } else {
    modalTitle.textContent = "Grid Drawn!";
    modalTitle.style.color = 'var(--text-main)';
    modalMessage.textContent = "The board filled up without a winner.";
  }

  if (playerScore === 2 || aiScore === 2) {
    modalTitle.textContent = playerScore === 2 ? "MATCH WON! 🏆" : "MATCH LOST! 💀";
    modalMessage.textContent = "Click button to start a completely new match.";
    nextGridBtn.textContent = "New Match";
    nextGridBtn.onclick = fullReset;
  } else {
    nextGridBtn.textContent = "Next Grid";
    nextGridBtn.onclick = resetGame;
  }

  modal.classList.remove('hidden');
}

// Start
let playerAvatar = '🧑';
let selectedDiff = 'easy';

document.querySelectorAll('.avatar-opt').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.avatar-opt').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    playerAvatar = btn.dataset.avatar;
  });
});

document.querySelectorAll('.diff-opt').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.diff-opt').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    selectedDiff = btn.dataset.diff;
  });
});

document.getElementById('start-game-btn').addEventListener('click', () => {
  document.getElementById('setup-modal').classList.add('hidden');
  initAudio();
  
  // Set player avatar visually
  document.getElementById('player-avatar').textContent = playerAvatar;
  
  // Sync difficulty to main game logic
  difficultySelect.value = selectedDiff;
  difficultySelect.dispatchEvent(new Event('change'));
});

// Rules Modal
const rulesModal = document.getElementById('rules-modal');
document.getElementById('help-btn').addEventListener('click', () => {
  rulesModal.classList.remove('hidden');
});
document.getElementById('close-rules-btn').addEventListener('click', () => {
  rulesModal.classList.add('hidden');
});

initGrid();
updateUI();
updateStatus();
