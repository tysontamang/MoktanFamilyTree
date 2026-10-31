import { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Plus, Moon, Sun, Download, Upload, Search, 
  User, X, Heart, Maximize, ZoomIn, ZoomOut, Wand2 
} from 'lucide-react';

import { CARD_HEIGHT, fitTreeView, layoutTree, treeConnections } from './treeLayout';
import initialMembers from '../tree/family_tree.json';

export default function FamilyTreeApp() {
  // BYPASS CORRUPTED MEMORY BY USING A NEW STORAGE KEY: 'family_tree_v2'
  const [members, setMembers] = useState(initialMembers);
  const membersRef = useRef(initialMembers);

  const [selectedId, setSelectedId] = useState(null);
  const selectedMember =
  members.find(member => member.id === selectedId) ?? null;

  const [childParentChoice, setChildParentChoice] = useState({});

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResultId, setSearchResultId] = useState(null);
  
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [isDraggingCanvas, setIsDraggingCanvas] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [draggingNodeId, setDraggingNodeId] = useState(null);
  
  const canvasRef = useRef(null);
  const pointerPositionsRef = useRef(new Map());
  const pinchStartRef = useRef(null);

  useEffect(() => {
    membersRef.current = members;
  }, [members]);

  const fitTree = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const paddingTop = parseFloat(window.getComputedStyle(canvas).paddingTop) || 0;
    const view = fitTreeView(membersRef.current, canvas.clientWidth, canvas.clientHeight, paddingTop);
    setPan(view.pan);
    setZoom(view.zoom);
  }, []);

  useEffect(() => {
    fitTree();
    window.addEventListener('resize', fitTree);
    return () => window.removeEventListener('resize', fitTree);
  }, [fitTree]);

  const findMatches = (query) => {
    const term = query.trim().toLowerCase();
    if (!term) return [];
    return members.filter(m => (m.fullName || '').toLowerCase().includes(term))
      .sort((a, b) => Number((b.fullName || '').toLowerCase() === term) - Number((a.fullName || '').toLowerCase() === term));
  };

  const focusSearchResult = (member) => {
    if (!member || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const paddingTop = parseFloat(window.getComputedStyle(canvas).paddingTop) || 0;
    const nextZoom = Math.min(1.25, canvas.clientWidth / 300);
    setIsDrawerOpen(false);
    setSelectedId(member.id);
    setSearchResultId(member.id);
    setZoom(nextZoom);
    setPan({
      x: canvas.clientWidth / 2 - (member.x + 100) * nextZoom,
      y: (canvas.clientHeight - paddingTop) / 2 - (member.y + CARD_HEIGHT / 2) * nextZoom,
    });
  };

  const searchMatches = findMatches(searchQuery);

  

  const handleWheel = (e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const zoomAdjust = e.deltaY * -0.002;
      setZoom((z) => Math.min(Math.max(0.05, z + zoomAdjust), 3));
    }
  };

  const handlePointerDown = (e) => {
    if (e.target.closest('.node-card')) return; 
    e.currentTarget.setPointerCapture(e.pointerId);
    pointerPositionsRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointerPositionsRef.current.size === 2) {
      const [first, second] = [...pointerPositionsRef.current.values()];
      const rect = e.currentTarget.getBoundingClientRect();
      const paddingTop = parseFloat(window.getComputedStyle(e.currentTarget).paddingTop) || 0;
      const center = {
        x: (first.x + second.x) / 2 - rect.left,
        y: (first.y + second.y) / 2 - rect.top - paddingTop,
      };
      pinchStartRef.current = {
        distance: Math.hypot(second.x - first.x, second.y - first.y),
        zoom,
        worldX: (center.x - pan.x) / zoom,
        worldY: (center.y - pan.y) / zoom,
      };
      setIsDraggingCanvas(false);
    } else {
      setIsDraggingCanvas(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handlePointerMove = (e) => {
    if (pointerPositionsRef.current.has(e.pointerId)) {
      pointerPositionsRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    if (pointerPositionsRef.current.size >= 2 && pinchStartRef.current) {
      const [first, second] = [...pointerPositionsRef.current.values()];
      const rect = canvasRef.current.getBoundingClientRect();
      const paddingTop = parseFloat(window.getComputedStyle(canvasRef.current).paddingTop) || 0;
      const zoomNext = Math.min(3, Math.max(
        0.05,
        pinchStartRef.current.zoom * Math.hypot(second.x - first.x, second.y - first.y) / pinchStartRef.current.distance,
      ));
      setZoom(zoomNext);
      setPan({
        x: (first.x + second.x) / 2 - rect.left - pinchStartRef.current.worldX * zoomNext,
        y: (first.y + second.y) / 2 - rect.top - paddingTop - pinchStartRef.current.worldY * zoomNext,
      });
      return;
    }
    if (isDraggingCanvas) {
      setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    }
    if (draggingNodeId) {
      const dx = e.movementX / zoom;
      const dy = e.movementY / zoom;
      setPan(p => ({ x: p.x + dx * zoom, y: p.y + dy * zoom }));
    }
  };

  const handlePointerUp = (e) => {
    pointerPositionsRef.current.delete(e.pointerId);
    pinchStartRef.current = null;
    if (pointerPositionsRef.current.size === 1) {
      const remaining = [...pointerPositionsRef.current.values()][0];
      setIsDraggingCanvas(true);
      setDragStart({ x: remaining.x - pan.x, y: remaining.y - pan.y });
    } else {
      setIsDraggingCanvas(false);
    }
    setDraggingNodeId(null);
  };

  const getFreePosition = (targetX, targetY, currentMembers) => {
    let x = targetX;
    let y = targetY;
    let overlap = true;
    while (overlap) {
      overlap = currentMembers.some(m => Math.abs(m.x - x) < 248 && Math.abs(m.y - y) < CARD_HEIGHT + 40);
      if (overlap) x += 230; 
    }
    return { x, y };
  };

  const autoArrange = () => {
    setMembers(layoutTree(members));
  };

  const exportTree = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(members));
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute("href", dataStr);
    dlAnchorElem.setAttribute("download", "family_tree.json");
    dlAnchorElem.click();
  };

  const importTree = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const imported = JSON.parse(event.target.result);
          if (Array.isArray(imported)) {
            setMembers(layoutTree(imported));
          }
        } catch (err) {
          alert("Invalid file format.");
        }
      };
      reader.readAsText(file);
    }
  };

  const generateId = () => Math.random().toString(36).substr(2, 9);

  const addRelative = (type, targetId) => {
    const target = members.find(m => m.id === targetId);
    if (!target) return;

    const newId = generateId();
    let newMember = {
      id: newId, fullName: "New Relative", maidenName: "", birthDate: "", deathDate: "",
      gender: "other", avatarUrl: "", bio: "",
      fatherId: null, motherId: null, spouseIds: [],
      x: 0, y: 0
    };

    let updatedMembers = [...members];

    if (type === 'father' || type === 'mother') {
      const parentX = type === 'father' ? target.x - 130 : target.x + 130;
      const pos = getFreePosition(parentX, target.y - 280, updatedMembers);
      newMember.gender = type === 'father' ? 'male' : 'female';
      newMember.x = pos.x; newMember.y = pos.y;
      updatedMembers.push(newMember);
      updatedMembers = updatedMembers.map(m => m.id === targetId ? { ...m, [type === 'father' ? 'fatherId' : 'motherId']: newId } : m);
    
    } else if (type === 'spouse') {
      const pos = getFreePosition(target.x + 260, target.y, updatedMembers);
      newMember.gender = target.gender === 'male' ? 'female' : 'male';
      newMember.x = pos.x; newMember.y = pos.y;
      newMember.spouseIds = [targetId];
      updatedMembers.push(newMember);
      updatedMembers = updatedMembers.map(m => m.id === targetId ? { ...m, spouseIds: [...(m.spouseIds || []), newId] } : m);
    
    } else if (type === 'child') {
      const chosenParent = childParentChoice[targetId] ?? (target.spouseIds?.length === 1 ? target.spouseIds[0] : '');
      const spouseId = target.spouseIds?.includes(chosenParent) ? chosenParent : null;
      let centerX = target.x;
      if (spouseId) {
        const spouse = updatedMembers.find(m => m.id === spouseId);
        if (spouse) centerX = (target.x + spouse.x) / 2;
      }
      
      const pos = getFreePosition(centerX, target.y + 280, updatedMembers);
      newMember.x = pos.x; newMember.y = pos.y;
      if (target.gender === 'female') {
        newMember.motherId = targetId;
        if (spouseId) newMember.fatherId = spouseId;
      } else {
        newMember.fatherId = targetId;
        if (spouseId) newMember.motherId = spouseId;
      }
      updatedMembers.push(newMember);
    }

    setMembers(layoutTree(updatedMembers));
    setSelectedId(newId);
    setIsDrawerOpen(true);
  };

  const updateMember = (id, field, value) => {
    setMembers(members.map(m => m.id === id ? { ...m, [field]: value } : m));
  };

  const deleteMember = (id) => {
    if (window.confirm("Are you sure you want to delete this person? Connections will be removed.")) {
      setMembers(layoutTree(members.filter(m => m.id !== id).map(m => {
        let updated = { ...m };
        if (updated.fatherId === id) updated.fatherId = null;
        if (updated.motherId === id) updated.motherId = null;
        updated.spouseIds = (updated.spouseIds || []).filter(spouseId => spouseId !== id);
        return updated;
      })));
      setIsDrawerOpen(false);
    }
  };

  const drawConnections = () => {
    const { couples, branches } = treeConnections(members);
    return <>
      {branches.map(({ key, d }) => <g key={`family-${key}`}>
        <path d={d} stroke={darkMode ? '#111827' : '#f9fafb'} strokeWidth="7" fill="none" strokeLinejoin="round" />
        <path d={d} stroke={darkMode ? '#94a3b8' : '#64748b'} strokeWidth="2" fill="none" strokeLinejoin="round" />
      </g>)}
      {couples.map(({ key, x1, x2, y, d }) => <g key={`spouse-${key}`}>
        <path d={d} stroke={darkMode ? '#fda4af' : '#be123c'} strokeWidth="2" fill="none" />
        <Heart size={14} fill={darkMode ? '#fda4af' : '#be123c'} color={darkMode ? '#fda4af' : '#be123c'} x={(x1 + x2) / 2 - 7} y={y - 7} />
      </g>)}
    </>;
  };

  return (
    <div className={`fixed inset-0 h-dvh w-screen overflow-hidden font-sans transition-colors duration-300 ${darkMode ? 'dark bg-gray-900 text-gray-100' : 'bg-gray-50 text-gray-900'}`}>
      
      <div className={`fixed top-0 left-0 right-0 z-50 flex flex-col gap-2 px-3 py-2 shadow-md sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-3 ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
        <h1 className="whitespace-nowrap text-lg font-bold text-blue-700 dark:text-blue-300 sm:text-xl">
          Moktan Family Tree
        </h1>
        
        <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto sm:gap-4">
          <div className="relative min-w-0 flex-1 sm:w-56 sm:flex-none md:w-64">
            <Search className="absolute left-3 top-2 text-gray-600 dark:text-gray-300" size={18} />
            <input 
              type="text" 
              placeholder="Search relatives..." 
              value={searchQuery}
              onChange={(e) => {
                const query = e.target.value;
                setSearchQuery(query);
                setSearchResultId(null);
                focusSearchResult(findMatches(query)[0]);
              }}
              onKeyDown={(e) => {
                if (e.key !== 'Enter' || !searchMatches.length) return;
                e.preventDefault();
                const current = searchMatches.findIndex(m => m.id === searchResultId);
                focusSearchResult(searchMatches[(current + 1) % searchMatches.length]);
              }}
              aria-label="Search relatives"
              aria-describedby="search-status"
              className={`w-full pl-10 pr-4 py-1.5 rounded-full text-sm outline-none border focus:ring-2 focus:ring-blue-500 ${darkMode ? 'bg-gray-700 border-slate-400' : 'bg-gray-100 border-slate-500'}`}
            />
            <span id="search-status" role="status" className={`absolute top-full left-0 mt-2 rounded-md px-3 py-1 text-xs whitespace-nowrap shadow ${searchQuery.trim() ? '' : 'sr-only'} ${darkMode ? 'bg-gray-800 text-gray-100' : 'bg-white text-gray-700'}`}>
              {searchQuery.trim() && (searchMatches.length ? `${searchMatches.length} match${searchMatches.length === 1 ? '' : 'es'}${searchMatches.length > 1 ? ' · Enter for next' : ''}` : 'No matching relatives')}
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-0 border-l border-gray-300 pl-1 dark:border-gray-600 sm:gap-2 sm:pl-4">
            <button onClick={autoArrange} className="flex size-10 items-center justify-center rounded-full text-blue-700 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-gray-700 sm:size-auto sm:p-2" title="Auto-Organize Layout" aria-label="Auto-organize layout">
              <Wand2 size={20} />
            </button>
            <button onClick={() => setDarkMode(!darkMode)} className="flex size-10 items-center justify-center rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 sm:size-auto sm:p-2" title="Toggle color theme" aria-label="Toggle color theme">
              {darkMode ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            <button onClick={exportTree} className="flex size-10 items-center justify-center rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 sm:size-auto sm:p-2" title="Backup Tree" aria-label="Backup tree">
              <Download size={20} />
            </button>
            <label className="flex size-10 cursor-pointer items-center justify-center rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 sm:size-auto sm:p-2" title="Load Tree">
              <Upload size={20} />
              <input type="file" accept=".json" onChange={importTree} className="sr-only" aria-label="Load tree backup" />
            </label>
          </div>
        </div>
      </div>

      <div 
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none cursor-grab pt-24 active:cursor-grabbing sm:pt-16"
        onWheel={handleWheel}
        onClick={(e) => {
          if (e.target.closest('.node-card')) return;
          setIsDrawerOpen(false);
          setSelectedId(null);
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <div style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: '0 0' }} className="w-full h-full relative">
          
          <svg className="absolute top-0 left-0 overflow-visible pointer-events-none" style={{ width: '100%', height: '100%' }}>
            {drawConnections()}
          </svg>

          {members.map((member) => {
            const isHighlighted = searchQuery && member.fullName.toLowerCase().includes(searchQuery.toLowerCase());
            return (
              <div 
                key={member.id}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  setDraggingNodeId(member.id);
                }}
                onClick={() => {
                  setSelectedId(member.id);
                  setIsDrawerOpen(true);
                }}
                className={`node-card absolute w-[200px] p-4 rounded-xl shadow-lg border-2 cursor-pointer transition-colors
                  ${darkMode ? 'bg-gray-800 hover:bg-gray-700' : 'bg-white hover:bg-blue-50'}
                  ${selectedId === member.id ? 'border-blue-500 ring-4 ring-blue-500/20' : isHighlighted ? 'border-yellow-400 ring-4 ring-yellow-400/50' : 'border-slate-400 dark:border-slate-500'}`
                }
                style={{ left: member.x, top: member.y, height: CARD_HEIGHT }}
              >
                <div className="flex flex-col items-center text-center">
                  <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-3 bg-gray-200 overflow-hidden shadow-inner ${member.gender === 'male' ? 'bg-blue-100' : member.gender === 'female' ? 'bg-pink-100' : 'bg-gray-200'}`}>
                    {member.avatarUrl ? (
                      <img src={member.avatarUrl} alt={member.fullName} className="w-full h-full object-cover" />
                    ) : (
                      <User size={32} className="text-gray-600" />
                    )}
                  </div>
                  <h3 className="font-bold text-sm truncate w-full">{member.fullName || "Unknown"}</h3>
                  {member.birthDate && <span className="text-xs text-gray-600 dark:text-gray-300 mt-1 truncate w-full">{member.birthDate} - {member.deathDate || "Present"}</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className={`fixed bottom-4 left-3 flex flex-col rounded-lg p-1 shadow-lg sm:bottom-6 sm:left-6 ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
        <button onClick={() => setZoom(z => Math.min(z + 0.2, 3))} className="flex size-11 items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-gray-700" title="Zoom in" aria-label="Zoom in"><ZoomIn size={20}/></button>
        <button onClick={() => setZoom(z => Math.max(z - 0.2, 0.05))} className="flex size-11 items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-gray-700" title="Zoom out" aria-label="Zoom out"><ZoomOut size={20}/></button>
        <button onClick={fitTree} className="flex size-11 items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-gray-700" title="Fit tree to screen" aria-label="Fit tree to screen"><Maximize size={20}/></button>
      </div>

      <div className={`fixed top-0 right-0 h-dvh w-full max-w-96 shadow-2xl transition-transform duration-300 transform sm:w-96 ${isDrawerOpen ? 'translate-x-0' : 'translate-x-full'} ${darkMode ? 'bg-gray-800 border-l border-gray-700' : 'bg-white'}`}>
        {selectedMember && (
          <div className="h-full flex flex-col">
            <div className="flex justify-between items-center p-6 border-b dark:border-gray-700">
              <h2 className="text-lg font-bold">Profile Details</h2>
              <button onClick={() => setIsDrawerOpen(false)} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full"><X size={20} /></button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider mb-1">Photo URL</label>
                <input 
                  type="text" 
                  value={selectedMember.avatarUrl || ''} 
                  onChange={(e) => updateMember(selectedId, 'avatarUrl', e.target.value)}
                  className={`w-full p-2 rounded-md outline-none focus:ring-2 focus:ring-blue-500 ${darkMode ? 'bg-gray-700' : 'bg-gray-100'}`} 
                  placeholder="https://..." 
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider mb-1">Full Name</label>
                  <input type="text" value={selectedMember.fullName || ''} onChange={(e) => updateMember(selectedId, 'fullName', e.target.value)} className={`w-full p-2 rounded-md outline-none focus:ring-2 focus:ring-blue-500 ${darkMode ? 'bg-gray-700' : 'bg-gray-100'}`} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider mb-1">MAIDEN Name</label>
                  <input type="text" value={selectedMember.maidenName || ''} onChange={(e) => updateMember(selectedId, 'maidenName', e.target.value)} className={`w-full p-2 rounded-md outline-none focus:ring-2 focus:ring-blue-500 ${darkMode ? 'bg-gray-700' : 'bg-gray-100'}`} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider mb-1">Birth Year</label>
                  <input type="text" value={selectedMember.birthDate || ''} onChange={(e) => updateMember(selectedId, 'birthDate', e.target.value)} className={`w-full p-2 rounded-md outline-none focus:ring-2 focus:ring-blue-500 ${darkMode ? 'bg-gray-700' : 'bg-gray-100'}`} placeholder="YYYY" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider mb-1">Death Year</label>
                  <input type="text" value={selectedMember.deathDate || ''} onChange={(e) => updateMember(selectedId, 'deathDate', e.target.value)} className={`w-full p-2 rounded-md outline-none focus:ring-2 focus:ring-blue-500 ${darkMode ? 'bg-gray-700' : 'bg-gray-100'}`} placeholder="Leave empty if living" />
                </div>
              </div>

              <div>
                 <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider mb-1">Gender</label>
                 <select value={selectedMember.gender} onChange={(e) => updateMember(selectedId, 'gender', e.target.value)} className={`w-full p-2 rounded-md outline-none focus:ring-2 focus:ring-blue-500 ${darkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>
                   <option value="male">Male</option>
                   <option value="female">Female</option>
                   <option value="other">Other</option>
                 </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider mb-1">Notes / Bio</label>
                <textarea rows="3" value={selectedMember.bio || ''} onChange={(e) => updateMember(selectedId, 'bio', e.target.value)} className={`w-full p-2 rounded-md outline-none focus:ring-2 focus:ring-blue-500 resize-none ${darkMode ? 'bg-gray-700' : 'bg-gray-100'}`} />
              </div>

              <div className="pt-4 border-t dark:border-gray-700">
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider mb-3">Add Relatives</label>
                {selectedMember.spouseIds?.length > 0 && (
                  <div className="mb-4 space-y-2">
                    <p className="text-sm text-gray-700 dark:text-gray-200">
                      Spouses: {selectedMember.spouseIds.map(id => members.find(m => m.id === id)?.fullName || 'Unknown').join(', ')}
                    </p>
                    <label htmlFor="child-parent" className="block text-sm font-medium">Other parent for a new child</label>
                    <select id="child-parent"
                      value={childParentChoice[selectedId] ?? (selectedMember.spouseIds.length === 1 ? selectedMember.spouseIds[0] : '')}
                      onChange={e => setChildParentChoice(previous => ({ ...previous, [selectedId]: e.target.value }))}
                      className={`w-full p-2 rounded-md ${darkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>
                      <option value="">Unspecified / this person only</option>
                      {selectedMember.spouseIds.map((id, index) => <option key={id} value={id}>
                        {members.find(m => m.id === id)?.fullName || 'Unknown'} (spouse {index + 1})
                      </option>)}
                    </select>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  {!selectedMember.fatherId && (
                    <button onClick={() => addRelative('father', selectedId)} className="flex items-center justify-center p-2 text-sm bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 dark:bg-blue-900 dark:text-blue-100 dark:hover:bg-blue-800">
                      <Plus size={16} className="mr-1"/> Father
                    </button>
                  )}
                  {!selectedMember.motherId && (
                    <button onClick={() => addRelative('mother', selectedId)} className="flex items-center justify-center p-2 text-sm bg-pink-100 text-pink-700 rounded-md hover:bg-pink-200 dark:bg-pink-900 dark:text-pink-100 dark:hover:bg-pink-800">
                      <Plus size={16} className="mr-1"/> Mother
                    </button>
                  )}
                    <button onClick={() => addRelative('spouse', selectedId)} className="flex items-center justify-center p-2 text-sm bg-red-100 text-red-700 rounded-md hover:bg-red-200 dark:bg-red-900 dark:text-red-100 dark:hover:bg-red-800">
                      <Heart size={14} className="mr-1"/> Add Spouse
                    </button>
                  <button onClick={() => addRelative('child', selectedId)} className="flex items-center justify-center p-2 text-sm bg-green-100 text-green-700 rounded-md hover:bg-green-200 dark:bg-green-900 dark:text-green-100 dark:hover:bg-green-800">
                    <Plus size={16} className="mr-1"/> Child
                  </button>
                </div>
              </div>

              <div className="pt-6">
                <button onClick={() => deleteMember(selectedId)} className="w-full py-2 text-red-700 dark:text-red-200 bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/40 rounded-md transition-colors font-semibold">
                  Delete Person
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
