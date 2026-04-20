/**
 * sample-data.js — a ready-made CSV the editor loads on first visit.
 * Demonstrates metadata, KPIs, sections, text, and a few chart types.
 */

/* global SampleData:true */

var SampleData = (function () {
  "use strict";

  var csv = [
    "#dashboard, title=Example Country HNO 2026, style=ocha",
    "",
    "kpi_label,kpi_value,kpi_icon,kpi_unit",
    "People in need,5200000,People-in-need,",
    "People targeted,3800000,People-targeted,",
    "Funding required,820000000,Fund,USD",
    "Partners,142,Partnership,",
    "",
    "section,chart_type,chart_title,label,value,series,sort,note",
    "Overview,text,,\"Humanitarian needs remain concentrated in the northern regions, driven by conflict and recurring drought. The figures below summarise the most urgent sectors.\",,,,",
    "Food Security,hbar,People in need by region,North,2100000,,1,",
    "Food Security,hbar,People in need by region,Centre,1600000,,2,",
    "Food Security,hbar,People in need by region,South,900000,,3,",
    "Food Security,hbar,People in need by region,East,600000,,4,",
    "Health,donut,Facilities by status,Functional,62,,,",
    "Health,donut,Facilities by status,Partially functional,28,,,",
    "Health,donut,Facilities by status,Non-functional,10,,,",
    "Protection,stacked-col,Incidents by month,Jan,120,GBV,,",
    "Protection,stacked-col,Incidents by month,Jan,80,Child protection,,",
    "Protection,stacked-col,Incidents by month,Feb,140,GBV,,",
    "Protection,stacked-col,Incidents by month,Feb,75,Child protection,,",
    "Protection,stacked-col,Incidents by month,Mar,160,GBV,,",
    "Protection,stacked-col,Incidents by month,Mar,90,Child protection,,",
    "Education,vbar,Out-of-school children,Boys,420000,,1,",
    "Education,vbar,Out-of-school children,Girls,510000,,2,"
  ].join("\n");

  return { csv: csv };
})();
