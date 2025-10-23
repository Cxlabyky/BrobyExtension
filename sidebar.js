console.log('🐾 Sidebar loaded');

class BrobyVetsSidebar {
  constructor() {
    this.currentPatient = null;
    this.lastUpdate = 0;
    this.pollCount = 0;
    this.init();
  }

  async init() {
    console.log('⚙️ Initializing...');
    
    // Start button
    document.getElementById('startBtn')?.addEventListener('click', () => {
      if (this.currentPatient) {
        alert(`✅ Recording started for ${this.currentPatient.name}`);
      } else {
        alert('❌ No patient selected');
      }
    });

    // Storage change listener
    chrome.storage.onChanged.addListener((changes, area) => {
      console.log('📨 STORAGE CHANGED:', changes);
      if (area === 'local' && changes.currentPatient) {
        const patient = changes.currentPatient.newValue;
        console.log('👤 Patient from storage change:', patient.name);
        this.updatePatient(patient);
      }
    });

    // Load initial
    await this.checkStorage();
    
    // Start polling
    console.log('🔄 Starting polling interval...');
    setInterval(() => {
      this.pollCount++;
      console.log('⏰ Poll #' + this.pollCount);
      this.checkStorage();
    }, 1000);
    
    console.log('✅ Sidebar initialized');
  }

  async checkStorage() {
    try {
      const data = await chrome.storage.local.get(['currentPatient', 'lastUpdate']);
      
      console.log('📂 Storage check:', data);
      
      if (data.currentPatient) {
        if (data.lastUpdate !== this.lastUpdate) {
          console.log('🎯 NEW UPDATE DETECTED:', data.currentPatient.name);
          this.lastUpdate = data.lastUpdate;
          this.updatePatient(data.currentPatient);
        } else {
          console.log('✓ No changes (lastUpdate:', data.lastUpdate, ')');
        }
      } else {
        console.log('⚠️ No patient in storage');
      }
    } catch (error) {
      console.error('❌ Storage error:', error);
    }
  }

  updatePatient(patient) {
    console.log('🎯 UPDATE UI:', patient.name);
    this.currentPatient = patient;
    
    const nameEl = document.querySelector('.patient-name');
    const detailsEl = document.querySelector('.patient-details');
    
    if (nameEl) {
      nameEl.textContent = patient.name;
      nameEl.style.color = '#1FC7CA';
      setTimeout(() => nameEl.style.color = '#FFFFFF', 500);
    }
    
    if (detailsEl) {
      detailsEl.textContent = `${patient.species} • ID: ${patient.id} • ${patient.date}`;
    }
    
    console.log('✅ UI updated');
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    console.log('📄 DOM loading...');
    window.brobyVets = new BrobyVetsSidebar();
  });
} else {
  console.log('📄 DOM ready');
  window.brobyVets = new BrobyVetsSidebar();
}
