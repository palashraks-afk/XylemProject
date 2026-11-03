(async function(){
  "use strict";
  const $=s=>document.querySelector(s), money=v=>v>=1e9?"$"+(v/1e9).toFixed(2)+"B":v>=1e6?"$"+(v/1e6).toFixed(v>=1e8?0:1)+"M":"$"+Math.round(v).toLocaleString("en-US"),
    num=v=>Math.round(v).toLocaleString("en-US"), pct=v=>Math.round(v*100)+"%",
    esc=v=>String(v??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  function fail(message){$("#error").hidden=false;$("#error").textContent=message;$("#plan-state").textContent="Unable to calculate";$("#stress").disabled=true;}
  const get=async path=>{const response=await fetch(path);if(!response.ok)throw Error("Could not load "+path);return response.json();};
  try{
    if(!window.L)throw Error("The map library did not load. Check your connection and reload.");
    const [systems,summary,context,polygons,coverage]=await Promise.all([
      get("data/systems.json"),get("data/summary.json"),get("data/safer_context.json"),
      get("data/boundaries.geojson").catch(()=>null),get("data/boundary_coverage.json").catch(()=>null)
    ]);
    if(!systems.length||new Set(systems.map(s=>s.id)).size!==systems.length)throw Error("The model requires unique water-system IDs.");
    const byId=new Map(systems.map((s,i)=>[s.id,i])),records=new Map(context.map(s=>[s.id,s])),
      maxBudget=Math.ceil(systems.reduce((v,s)=>v+Math.ceil(s.cost*2/XylemOpt.UNIT)*XylemOpt.UNIT,0)/5e6)*5;
    let params=XylemModel.normalize(Object.fromEntries(new URLSearchParams(location.hash.slice(1))),maxBudget);
    let plan=null,worker=null,requestId=0,uncertainty=null,selected=null,tab="funded",timer=null;
    let inPlan=new Set(),county="",colorMode="plan";
    const map=L.map("map",{preferCanvas:true}).fitBounds([[32.4,-124.5],[42.1,-114.1]],{padding:[16,16]});
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',maxZoom:17}).addTo(map);
    const dots=L.layerGroup().addTo(map),areas=L.layerGroup().addTo(map),markers=new Map(),layers=[];
    const statusColors={"Failing":"#bd6553","At-Risk":"#d8a355","Potentially At-Risk":"#b7ba72","Not At-Risk":"#94a8a0","Not Assessed":"#b8bec1"};
    function eligible(s){return byId.has(s.id);}
    function status(s){return s.status||(s.failing?"Failing":"At-Risk");}
    function frequency(i){return uncertainty?.frequency[i];}
    function color(s){
      const i=byId.get(s.id);
      if(colorMode==="frequency")return i!==undefined&&frequency(i)!==undefined?"hsl(155,"+Math.round(20+frequency(i)*40)+"%,"+Math.round(85-frequency(i)*57)+"%)":"#b8bec1";
      if(colorMode==="status"||i===undefined)return statusColors[status(s)]||"#94a8a0";
      return inPlan.has(i)?"#216857":s.failing?"#bd6553":"#d8a355";
    }
    function visible(s){return(!county||s.county===county)&&($("#context").checked||eligible(s));}
    function popup(s){
      const i=byId.get(s.id),cost=i===undefined?null:plan?.costs[i];
      return "<strong>"+esc(s.name)+"</strong><p>"+esc(s.id)+" · "+esc(s.county)+"</p><p>"+esc(status(s))+" · "+num(s.pop)+" people served</p>"+
        (cost!==null&&cost!==undefined?"<p>"+money(cost)+" estimated · "+(inPlan.has(i)?"Selected":"Not selected")+"</p>":"<p>Shown as context; outside this funding model.</p>")+"<small>Click for model inputs below the map.</small>";
    }
    context.forEach(s=>{
      if(!Number.isFinite(s.lat)||!Number.isFinite(s.lon)||!s.lat||!s.lon)return;
      const i=byId.get(s.id),record=i===undefined?s:{...s,...systems[i]};
      const marker=L.circleMarker([s.lat,s.lon],{radius:i===undefined?2.5:Math.min(11,3.5+Math.sqrt(s.pop)/90),weight:i===undefined?0:.8,color:"#fff",fillOpacity:i===undefined?.5:.8});
      marker.bindPopup(()=>popup(record));marker.on("click",()=>selectSystem(s.id,false));markers.set(s.id,{marker,record});
    });
    if(polygons)L.geoJSON(polygons,{onEachFeature:(feature,layer)=>{
      const i=byId.get(feature.properties.id);if(i===undefined)return;
      const record=systems[i];layer.bindPopup(()=>popup(record));layer.on("click",()=>selectSystem(record.id,false));layers.push({record,layer});
    }});
    function redrawMap(){
      dots.clearLayers();areas.clearLayers();let count=0;
      markers.forEach(({marker,record})=>{
        if(!visible(record))return;
        marker.setStyle({fillColor:color(record),fillOpacity:!eligible(record)?.45:colorMode==="plan"&&!inPlan.has(byId.get(record.id))?.6:.95});
        dots.addLayer(marker);count++;
      });
      if($("#boundaries").checked)layers.forEach(({record,layer})=>{
        if(!visible(record))return;
        const funded=inPlan.has(byId.get(record.id));layer.setStyle({color:color(record),weight:funded?1.2:.6,fillColor:color(record),fillOpacity:funded?.18:.06});areas.addLayer(layer);
      });
      let legend=colorMode==="plan"?[["#216857","Selected for funding"],["#bd6553","Failing · not selected"],["#d8a355","At-risk · not selected"],["#a7b6ae","Other SAFER systems"]]:
        colorMode==="status"?Object.entries(statusColors).map(([a,b])=>[b,a]):
        uncertainty?[["hsl(155,60%,28%)","Selected in most cost scenarios"],["hsl(155,20%,85%)","Selected in few cost scenarios"]]:[["#b8bec1","Run cost scenarios to view frequency"]];
      $("#legend").innerHTML=legend.map(([c,label])=>'<div><i class="swatch" style="background:'+c+'"></i>'+label+"</div>").join("");
      $("#map-count").textContent=num(count)+" mapped systems"+(county?" · "+county+" County":" · statewide");
    }
    function statCard(label,value,sub){return '<div class="metric"><div class="label">'+label+'</div><div class="value">'+value+'</div><div class="sub">'+sub+"</div></div>";}
    function renderPlan(){
      if(!plan)return;
      inPlan=new Set(plan.chosen);
      const sum=(ix,key)=>ix.reduce((v,i)=>v+systems[i][key],0),people=sum(plan.chosen,"pop"),base=sum(plan.baseline,"pop"),
        spent=plan.chosen.reduce((v,i)=>v+plan.costs[i],0),rounded=plan.chosen.reduce((v,i)=>v+Math.ceil(plan.costs[i]/XylemOpt.UNIT)*XylemOpt.UNIT,0),
        left=systems.map((s,i)=>s.failing&&!inPlan.has(i)?i:-1).filter(i=>i>=0);
      const change=base?((people-base)/base):0,comparison=base?(Math.abs(change)<.0005?"Same potential reach as":pct(Math.abs(change))+(change<0?" fewer people than":" more people than"))+" status-first":"No status-first selection at this budget";
      $("#metrics").innerHTML=statCard("POTENTIAL PEOPLE REACHED",num(people),comparison)+
        statCard("SYSTEMS SELECTED",num(plan.chosen.length),num(systems.length)+" eligible · "+num(plan.chosen.filter(i=>systems[i].conn<=500).length)+" small")+
        statCard("ESTIMATED SPEND",money(spent),money(rounded)+" incl. rounding · "+money(params.budget*1e6)+" budget")+
        statCard("FAILING SYSTEMS LEFT OUT",num(left.length),num(sum(left,"pop"))+" people served");
      $("#plan-state").textContent="Current scenario · statewide plan";$("#stress").disabled=false;$("#export").disabled=false;
      redrawMap();renderTable();renderDetail();
      window.__xylem={get params(){return {...params};},get plan(){return plan;},get uncertainty(){return uncertainty;},systems,summary,context};
    }
    function tableIndices(){
      if(!plan)return[];
      return systems.map((s,i)=>i).filter(i=>(!county||systems[i].county===county)&&(tab==="funded"?inPlan.has(i):tab==="left"?systems[i].failing&&!inPlan.has(i):true))
        .sort((a,b)=>systems[b].pop-systems[a].pop);
    }
    function renderTable(){
      const indices=tableIndices();
      $("#table-status").textContent=num(indices.length)+" systems"+(county?" in "+county+" County":" statewide")+" · sorted by population served";
      $("#system-rows").innerHTML=indices.length?indices.map(i=>{const s=systems[i];return '<tr><td><button class="system-link" data-id="'+esc(s.id)+'">'+esc(s.name)+'<small>'+esc(s.county)+" · "+esc(s.id)+'</small></button></td><td><span class="badge '+(s.failing?"":"risk")+'">'+(s.failing?"Failing":"At-risk")+'</span></td><td class="number">'+num(s.pop)+'</td><td class="number">'+money(plan.costs[i])+'</td><td class="number">'+(frequency(i)===undefined?"Not run":pct(frequency(i))+' of '+uncertainty.n)+"</td></tr>";}).join(""):'<tr><td colspan="5">No systems in this view. Try another budget or county.</td></tr>';
      $("#system-rows").querySelectorAll("[data-id]").forEach(button=>button.addEventListener("click",()=>selectSystem(button.dataset.id,true)));
    }
    function renderDetail(){
      if(!selected||!plan)return;
      const record=records.get(selected);if(!record)return;
      const i=byId.get(selected),s=i===undefined?record:{...record,...systems[i]},el=$("#detail");
      el.innerHTML="<p>"+esc(s.id)+" · "+esc(s.county)+" COUNTY</p><h3>"+esc(s.name)+'</h3><span>'+esc(status(s))+" · "+num(s.pop)+" people served · "+num(s.conn)+" connections</span>";
      if(i===undefined){el.innerHTML+='<p class="explain">This system is shown as SAFER context. The funding model currently includes Failing and At-Risk systems only. A system outside those groups is not assigned zero need.</p>';return;}
      const eq=XylemModel.equityValue(s),names=["Economic disadvantage","Environmental burden","Affordability","Poverty"],known=s.eq.filter(Number.isFinite).length;
      const div=(label,value)=>"<div>"+label+"<b>"+value+"</b></div>";
      el.innerHTML+='<div class="detail-grid">'+div("In this plan",inPlan.has(i)?"Selected":"Not selected")+div("Estimated cost",money(plan.costs[i]))+
        div("Illustrative cost range",money(plan.costs[i]*.5)+"–"+money(plan.costs[i]*2))+div("Weighted priority score",num(plan.benefits[i]))+
        div("Equity index",eq.toFixed(3)+" · "+known+"/4 inputs")+div("Economic status",esc(s.dac))+
        div("Small-system factor",(1+(s.conn<=500?params.small:0)).toFixed(1)+"×")+div("Cost-scenario selection",frequency(i)===undefined?"Not run":pct(frequency(i))+" of "+uncertainty.n)+"</div>"+
        '<p class="explain">'+names.map((name,k)=>name+": "+(Number.isFinite(s.eq[k])?s.eq[k].toFixed(3):"missing")).join(" · ")+
        ". Status factor: "+(s.failing?1:params.atRisk)+". Equity factor: "+(1+params.equity*eq).toFixed(3)+". "+
        (inPlan.has(i)?"The system is part of the highest-scoring set under the rounded-cost budget.":"The system is outside the selected set under this budget and these priorities; selection is a portfolio decision.")+
        (s.funded17?" Funding has been recorded since 2017; remaining project need is not known.":"")+"</p>";
    }
    function selectSystem(id,fly){
      selected=id;renderDetail();const item=markers.get(id);
      if(item&&fly){if(county&&item.record.county!==county){county=item.record.county;$("#county").value=county;redrawMap();renderTable();}
        map.flyTo(item.marker.getLatLng(),10,{duration:.6});item.marker.openPopup();}
      $("#detail").scrollIntoView({block:"nearest",behavior:"smooth"});
    }
    function labels(){
      const max=Math.ceil(systems.reduce((v,s)=>v+Math.ceil(s.cost*params.cost/XylemOpt.UNIT)*XylemOpt.UNIT,0)/5e6)*5;
      $("#budget").max=Math.max(max,params.budget);$("#budget").value=params.budget;
      $("#budget-value").textContent=money(params.budget*1e6);$("#budget-hint").textContent="Statewide funding · fund all at "+money(max*1e6)+" under current costs.";
      for(const key of ["equity","atRisk","small","cost"]){$("#"+key).value=params[key];$("#"+key+"-value").textContent=key==="atRisk"?pct(params[key]):key==="cost"?params[key].toFixed(2)+"×":key==="small"?"+"+pct(params[key]):params[key].toFixed(1);}
    }
    function saveHash(){history.replaceState(null,"","#"+new URLSearchParams(params));}
    function invalidate(){
      uncertainty=null;$("#stress-status").textContent="Uses your current budget and priorities.";
      $("#stress").textContent="Run 40 cost scenarios ↗";$("#stress").disabled=true;$("#export").disabled=true;
      if(colorMode==="frequency"){colorMode="plan";$("#map-mode").value="plan";}
    }
    function calculate(){
      clearTimeout(timer);worker?.terminate();invalidate();const id=++requestId;$("#plan-state").textContent="Calculating current scenario…";
      worker=new Worker("worker.js");
      worker.onmessage=({data})=>{
        if(data.id!==requestId)return;
        if(data.type==="plan"){plan=data.result;renderPlan();}
        if(data.type==="progress")$("#stress-status").textContent="Testing cost scenarios: "+data.done+" / "+data.total;
        if(data.type==="uncertainty"){
          if(data.fingerprint!==XylemModel.fingerprint(params))return;
          uncertainty=data;$("#stress").disabled=false;$("#stress").textContent="Run 40 cost scenarios ↗";
          $("#stress-status").textContent="40 scenarios for this exact budget and priority setting. Frequencies are sensitivity results, not outcome probabilities.";
          colorMode="frequency";$("#map-mode").value="frequency";redrawMap();renderTable();renderDetail();
        }
        if(data.type==="error")fail("The model could not calculate this scenario: "+data.message);
      };
      worker.onerror=()=>fail("The model worker could not load. Reload the tool, or serve the app over HTTP.");
      worker.postMessage({type:"init",systems});worker.postMessage({type:"plan",id,params});
    }
    function change(next){
      params=XylemModel.normalize({...params,...next},maxBudget);labels();saveHash();worker?.terminate();requestId++;invalidate();
      $("#plan-state").textContent="Updating scenario…";clearTimeout(timer);timer=setTimeout(calculate,100);
    }
    for(const key of Object.keys(XylemModel.DEFAULTS))$("#"+key).addEventListener("input",event=>change({[key]:Number(event.target.value)}));
    document.querySelectorAll("[data-budget]").forEach(button=>button.addEventListener("click",()=>change({budget:Number(button.dataset.budget)})));
    $("#fund-all").addEventListener("click",()=>change({budget:Math.ceil(systems.reduce((v,s)=>v+Math.ceil(s.cost*params.cost/XylemOpt.UNIT)*XylemOpt.UNIT,0)/5e6)*5}));
    document.querySelectorAll("[data-preset]").forEach(button=>button.addEventListener("click",()=>change(button.dataset.preset==="reach"?{equity:0,atRisk:1,small:0}:{equity:2,atRisk:.5,small:1})));
    $("#reset").addEventListener("click",()=>change(XylemModel.DEFAULTS));
    $("#stress").addEventListener("click",()=>{
      if(!plan||plan.fingerprint!==XylemModel.fingerprint(params))return;
      $("#stress").disabled=true;$("#stress").textContent="Testing costs…";$("#stress-status").textContent="Testing cost scenarios: 0 / 40";
      worker.postMessage({type:"uncertainty",id:requestId,params});
    });
    $("#share").addEventListener("click",async()=>{saveHash();try{await navigator.clipboard.writeText(location.href);$("#share-status").textContent="Scenario link copied.";}catch{$("#share-status").textContent="Copy this page’s address to share the scenario.";}});
    const counties=[...new Set(context.map(s=>s.county).filter(Boolean))].sort();
    counties.forEach(c=>$("#county").insertAdjacentHTML("beforeend",'<option value="'+esc(c)+'">'+esc(c)+" County</option>"));
    $("#county").addEventListener("change",event=>{
      county=event.target.value;redrawMap();renderTable();
      const points=[...markers.values()].filter(x=>visible(x.record)).map(x=>x.marker.getLatLng());
      if(points.length)map.fitBounds(L.latLngBounds(points).pad(.08),{maxZoom:10});
    });
    $("#map-mode").addEventListener("change",event=>{colorMode=event.target.value;redrawMap();});
    $("#context").addEventListener("change",redrawMap);$("#boundaries").addEventListener("change",redrawMap);
    const searchLabels=new Map();
    context.forEach(s=>searchLabels.set(s.name+" · "+s.id,s.id));
    $("#system-list").innerHTML=[...searchLabels.keys()].map(label=>'<option value="'+esc(label)+'"></option>').join("");
    $("#search").addEventListener("change",event=>{
      const value=event.target.value,id=searchLabels.get(value)||[...records.keys()].find(id=>id.toLowerCase()===value.toLowerCase());
      if(id){$("#context").checked=true;redrawMap();selectSystem(id,true);}
    });
    document.querySelectorAll("[data-tab]").forEach(button=>button.addEventListener("click",()=>{
      tab=button.dataset.tab;document.querySelectorAll("[data-tab]").forEach(b=>b.classList.toggle("active",b===button));renderTable();
    }));
    $("#export").addEventListener("click",()=>{
      if(!plan||plan.fingerprint!==XylemModel.fingerprint(params))return;
      const rows=[["pwsid","name","county","status","population_served","connections","estimated_cost_usd","weighted_priority_score","equity_index","cost_scenario_selection_frequency","scenario_count",...Object.keys(params)]];
      plan.chosen.forEach(i=>{const s=systems[i];rows.push([s.id,s.name,s.county,s.failing?"Failing":"At-Risk",s.pop,s.conn,plan.costs[i],plan.benefits[i],XylemModel.equityValue(s),frequency(i)??"",uncertainty?.n??0,...Object.values(params)]);});
      const csv=rows.map(row=>row.map(value=>{let v=String(value);if(/^[=+@-]/.test(v))v="'"+v;return '"'+v.replace(/"/g,'""')+'"';}).join(",")).join("\r\n");
      const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8;"})),link=document.createElement("a");link.href=url;link.download="xylem-safer-plan.csv";link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    });
    $("#snapshot").textContent="Snapshot "+String(summary.snapshot).slice(0,10)+" · "+num(context.length)+" systems";
    $("#target-count").textContent=num(systems.length);$("#rounding-unit").textContent=money(XylemOpt.UNIT);
    const mapped=[...markers.keys()].length,missing=context.length-mapped;
    $("#coverage").textContent=num(context.length)+" SAFER systems; "+num(mapped)+" mapped"+(missing?" ("+num(missing)+" have missing coordinates)":"")+". "+num(systems.length)+" Failing or At-Risk systems are eligible. "+
      (coverage?num(coverage.with_polygon)+" / "+num(coverage.targets)+" eligible systems have service-area polygons. ":"")+
      "Joined by PWSID. Other statuses remain visible as context; unassessed does not mean safe.";
    labels();redrawMap();calculate();
  }catch(error){fail(error.message);}
})();
