//link to Hack Reactor Project requirements: https://docs.google.com/document/d/1KYDJ3cANthdyFLoTWat8jbhF8YsvYtbq_bG78vrNwHY/edit

//OVERALL GOAL: Create website that makes it easier to bike around the city of SF and incentivizes you to bike over taking Uber
//User can use the site instead of Google Maps and see a running total of money saved by biking
//User also gets nearby parking and crime data to make a better informed choice as to whether to bike or not
//It could be REALLY cool (after learning more at Hack Reactor!!) to eventually pair this with Venmo or a payments platform so you could "pay yourself" as a reward

//GLOBAL VARIABLES
var uberClientId = "CzJIujgzsNGObUPtD9DU5m2HYyywu88T";
var uberServerToken = "F6nx3eyW2Z7QWxsXMtP3FrjCiMEDJy-wetF9lJlM";
var global_uber_price_object;
var uberXPrice;
var bikeTheftParsed = [];
var bikeParkingParsed = [];
var globalMarkerArray = [];

//map dropdown button variables
var inMapButtons = document.getElementsByClassName("controls2");
var bikingElement = document.getElementById("mode-default");
var parkingElement = document.getElementById("available-parking-default");
var theftElement = document.getElementById("safety-default");
var weatherAlert = document.getElementById("weather-alert");

//MAP INIT HANDLER:
function initMap() {
  var origin_place_id = null;
  var destination_place_id = null;
  var travel_mode = google.maps.TravelMode.BICYCLING;
  var map = new google.maps.Map(document.getElementById('map'), {
    mapTypeControl: false,
    center: {lat: 37.7833, lng: -122.4167},
    zoom: 13
  });
  
//resize map as the window is resized, keeping it centered on the page
var center;
function calculateCenter() {
  center = map.getCenter();
}
google.maps.event.addDomListener(map, 'idle', function() {
  calculateCenter();
});
google.maps.event.addDomListener(window, 'resize', function() {
  map.setCenter(center);
});

//add directions capabilities
var directionsService = new google.maps.DirectionsService;
var directionsDisplay = new google.maps.DirectionsRenderer;
directionsDisplay.setMap(map);

//push map input fields / text onto map
var origin_input = document.getElementById('origin-input');
var destination_input = document.getElementById('destination-input');
var modeHtml = document.getElementById('mode-default');
var parkingHtml = document.getElementById('available-parking-default');
var safeHtml = document.getElementById('safety-default');

map.controls[google.maps.ControlPosition.TOP_LEFT].push(origin_input);
map.controls[google.maps.ControlPosition.TOP_LEFT].push(destination_input);
map.controls[google.maps.ControlPosition.TOP_LEFT].push(modeHtml);
map.controls[google.maps.ControlPosition.TOP_LEFT].push(parkingHtml);
map.controls[google.maps.ControlPosition.TOP_LEFT].push(safeHtml);


var origin_autocomplete = new google.maps.places.Autocomplete(origin_input);
origin_autocomplete.bindTo('bounds', map);
var destination_autocomplete =
    new google.maps.places.Autocomplete(destination_input);
destination_autocomplete.bindTo('bounds', map);

//auto adjust map size to the screen
function expandViewportToFitPlace(map, place) {
    if (place.geometry.viewport) {
      map.fitBounds(place.geometry.viewport);
    } else {
      map.setCenter(place.geometry.location);
      map.setZoom(17);
    }
  }

//UBER DATA HANDLER: get price data from Uber and format. This will allow user to see Uber price for a given trip!
function getEstimatesForUserLocation(src_lat, src_lng, dst_lat, dst_lng) {
  $.ajax({
    url: "https://api.uber.com/v1/estimates/price",
    headers: {
        Authorization: "Token " + uberServerToken
    },
    data: {
      start_latitude: src_lat,
      start_longitude: src_lng,
      end_latitude: dst_lat,
      end_longitude: dst_lng
    },
    success: function(result) {
      processUberPriceObject(result);
      global_uber_price_object = result;
    }
  });
}

//process Uber Price Object in order to get the median price for UberX. Uber only gives ranges so the data needs manipulation.
function processUberPriceObject (uberPriceJSON) {
  uberXPrice = Math.round((uberPriceJSON.prices[0].high_estimate + uberPriceJSON.prices[0].low_estimate) / 2);
  $("#this-trip-savings").html("$" + uberXPrice + ".00");
}

//ORIGIN HANDLER
origin_autocomplete.addListener('place_changed', function() {
  var place = origin_autocomplete.getPlace();
  if (!place.geometry) {
    window.alert("Autocomplete's returned place contains no geometry");
    return;
  }
  expandViewportToFitPlace(map, place);

  // For origin, if the place has a geometry, store its place ID and route if we have the other place ID
  origin_place_id = place.place_id;
  
  route(origin_place_id, destination_place_id, travel_mode,
        directionsService, directionsDisplay);
    
  //add lat/lng to global array to be able to access later by Uber API
  origin_lat = place.geometry.location.lat();
  origin_lng = place.geometry.location.lng();
});

//DESTINATION HANDLER: intent is to get the page to update each time a user puts in a different destination. The bulk of the site's functionality is based here.
destination_autocomplete.addListener('place_changed', function() {
  var place = destination_autocomplete.getPlace();
  if (!place.geometry) {
    window.alert("Autocomplete's returned place contains no geometry");
    return;
  };
  try {
    if (!(place.vicinity.includes('San Francisco'))) throw "Address not in San Francisco!"
  }
  catch(err) {
    $("#this-trip-savings").html("$" + 0 + ".00");
    alert("Destination outside of SF and cannot calculate!");
    return;
  }

  expandViewportToFitPlace(map, place);

  //if the place has a geometry, store its place ID and route if we have the other place ID
  destination_place_id = place.place_id;
  route(origin_place_id, destination_place_id, travel_mode,
        directionsService, directionsDisplay);
  
  //add lat/lng to global array to be able to access later by Uber API
  destination_lat = place.geometry.location.lat();
  destination_lng = place.geometry.location.lng();

  //use the destination coordinates to find all nearby parking within 100 meters and store in variable
  var coordinateManipulation = 'https://data.sfgov.org/resource/w969-5mn4.json?$where=within_circle(latitude, ' + destination_lat + ', ' + destination_lng + ', 100)';

  $.getJSON(coordinateManipulation, function(data) {
    bikeParkingParsed = data;
 

  //add marker to the map with the nearest parking spot (and hide previous markers from showing!)
  var markerHideLoop = globalMarkerArray.forEach(function (item) {item.setMap(null)});

  var addMarkerFunction = function (parkingArray) {
    if (globalMarkerArray.length != 0) {
      markerHideLoop;
      if (parkingArray.length > 0) {
        var markerHolder; 
        var nearestLatLng = {
          lat: Number(parkingArray[0].latitude.latitude), 
          lng: Number(parkingArray[0].latitude.longitude)
        };
        markerHolder = new google.maps.Marker({
          position: nearestLatLng,
          title: 'Parking at ' + parkingArray[0].yr_inst
        });
        markerHolder.setMap(map);
        globalMarkerArray.push(markerHolder); 
      }
    } 
    else {
      if (globalMarkerArray.length == 0) { 
        var markerHolder;
        var nearestLatLng = {
          lat: Number(parkingArray[0].latitude.latitude), 
          lng: Number(parkingArray[0].latitude.longitude)
        };
        markerHolder = new google.maps.Marker({
          position: nearestLatLng,
          title: 'Parking at ' + parkingArray[0].yr_inst
        });
        markerHolder.setMap(map);
        globalMarkerArray.push(markerHolder);
      }
    }
  }; 
  
  addMarkerFunction(bikeParkingParsed);

  //dynamically update css for bike parking indicator
  var arrayOfHtmlObjects = document.getElementsByClassName("controls2");

  function cssParkingStyle(parkingArray) {
    if (parkingArray.length ===0) {
     //change css style to red 
     arrayOfHtmlObjects[1].id = "available-parking-red";
     arrayOfHtmlObjects[1].innerHTML = "No Parking!";
    } else if (parkingArray.length < 3) {
     //change css style to yellow
     arrayOfHtmlObjects[1].id = "available-parking-yellow";
     arrayOfHtmlObjects[1].innerHTML = "Some Parking";
    } else if (parkingArray.length >= 3) {
     //change css style to green
     arrayOfHtmlObjects[1].id = "available-parking-green";
     arrayOfHtmlObjects[1].innerHTML = "Lots-o-Parking";
    }
  };
 
  cssParkingStyle(bikeParkingParsed);

  //Create dropdown list for nearest parking spots (allows user to see data that generates the parking rating)
  var toTitleCase = function (str) {
    return str.replace(/\w*/g, function(txt){
      return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
    });
  }

  var appendParkingNodes = function(parkingArray) {
      if (parkingArray.length > 0) {
        parkingArray.forEach ( function(item) {
          var node = document.createElement("li");
          node.className = "dropdown-content";
          var textnode = document.createTextNode(toTitleCase(item.yr_inst));
          node.appendChild(textnode);
          arrayOfHtmlObjects[1].appendChild(node);
          });
      } else { 
        parkingArray.forEach ( function() {                   
          var node = document.createElement("li");
          node.className = "dropdown-content";
          var textnode = document.createTextNode("No nearby bike parking");
          node.appendChild(textnode);
          arrayOfHtmlObjects[1].appendChild(node); 
          });  
        }
    }; 

  appendParkingNodes(bikeParkingParsed);

  //use the destination coorinates to find all recent bike theft within 100 meters 
  var coordinateTheft = 'https://data.sfgov.org/resource/rj3c-cgxu.json?$where=within_circle(location, ' + destination_lat + ', ' + destination_lng + ', 100)';

  $.getJSON(coordinateTheft, function(data2) {
    bikeTheftParsed = data2;
  });

  function cssTheftStyle(theftArray) {
    if (theftArray.length == 0) {
     //change css style to green
     arrayOfHtmlObjects[2].id = "safety-green";
     arrayOfHtmlObjects[2].innerHTML = "Safe!";
    } else if (theftArray.length < 3) {
     //change css style to yellow
     arrayOfHtmlObjects[2].id = "safety-yellow";
     arrayOfHtmlObjects[2].innerHTML = "Safe";
    } else if (theftArray.length >= 3) {
     //change css style to red
     arrayOfHtmlObjects[2].id = "safety-red";
     arrayOfHtmlObjects[2].innerHTML = "Not Safe!";
    }
  };

  cssTheftStyle (bikeTheftParsed);
  
  //Create dropdown list for nearest crime events (allows user to see data that generates the safety rating)
    var appendTheftNodes = function(theftArray) {
      if (theftArray.length > 0) {
        theftArray.forEach(function(item) {
          var node = document.createElement("li", "class='dropdown-content'"); 
          node.className = "dropdown-content";
          var textnode = document.createTextNode(toTitleCase(item.category) + " at " + toTitleCase(item.address));
          node.appendChild(textnode);
          arrayOfHtmlObjects[2].appendChild(node); 
        });
      } else {
        theftArray.forEach(function(item) {
          var node = document.createElement("li", "class='dropdown-content'"); 
          node.className = "dropdown-content";
          var textnode = document.createTextNode("No crime reported nearby");
          node.appendChild(textnode);
          arrayOfHtmlObjects[2].appendChild(node); 
      })
    }
   };

  appendTheftNodes(bikeTheftParsed);

  //execute Uber price function for destination coordinates
  getEstimatesForUserLocation(origin_lat, origin_lng, destination_lat, destination_lng);
});
  });

  function route(origin_place_id, destination_place_id, travel_mode,
                 directionsService, directionsDisplay) {
    if (!origin_place_id || !destination_place_id) {
      return;
    }
    directionsService.route({
      origin: {'placeId': origin_place_id},
      destination: {'placeId': destination_place_id},
      travelMode: travel_mode
    }, function(response, status) {
      if (status === google.maps.DirectionsStatus.OK) {
        directionsDisplay.setDirections(response);
      } else {
        window.alert('Directions request failed due to ' + status);
      }
    });
  }
}

//BIKE AND UBER BUTTON FUNCTIONALITY: intent here is to allow the user to "make the choice" to bike or Uber
var totalSavings = 0;
var bikeButton = document.getElementById("bike"); //first button which is add button
var uberButton = document.getElementById("uber"); //second button which is uber ("subtract") button
var totalUberCalculationHolder = document.getElementById("total-savings"); //total savings
var ThisTripSavingsText = document.createElement("this-trip-savings");
var totalSavingsArray = [];

var addToTotalSavings = function() {
  document.getElementById("total-savings-calculator").innerHTML = "$" + uberXPrice + ".00";
}

//function to add current trip to total cost
var addToSum = function() {
  var x= confirm('Are you sure? Pressing "OK" will add to your total savings!')
  
  if ((uberXPrice > 0) && (x)) {
    if ((totalSavingsArray == 0) && (valueLargestKey != null)) {
        var localParsedStorage = parseInt(valueLargestKey);
        totalSavingsArray.push(localParsedStorage);
        totalSavingsArray.push(uberXPrice);
    } else {
    totalSavingsArray.push(uberXPrice);
    }
    //sum the items in the total savings array into a local variable of grand total
    var totalSavings = totalSavingsArray.reduce(function (a,b) {
        return a + b;
        });

    document.getElementById("total-savings-calculator").innerHTML = "$" + totalSavings + ".00";

    //dynamically change css styling to match pos/neg values
    var totalSavingsCss = function (totalSavingsVar) {
      if (totalSavingsVar < 0) {
        var greenRed = document.getElementById("total-savings-calculator");
        greenRed.setAttribute("class", "total-savings-calculator-neg");
      } else {
        var greenRed = document.getElementById("total-savings-calculator");
        greenRed.setAttribute("class", "total-savings-calculator-pos");
      }
    }
    totalSavingsCss(totalSavings);

    //add to local storage the total savings as a new element in object
    localStorage.setItem(Date.now(), totalSavings);
  } else if (uberXPrice < 0) {
    alert("Please enter an origin and destination to calculate!");
  }
}

//Similar function to the one for the bike click, but this time for Uber that subracts
var subtractFromSum = function() {
  var x= confirm('Are you sure? Pressing "OK" will subtract from your total savings!')
  
  if ((uberXPrice > 0) && (x)) {   
    if ((totalSavingsArray == 0) && (valueLargestKey != null)) {
          var localParsedStorage = parseInt(valueLargestKey);
          totalSavingsArray.push(localParsedStorage);
          totalSavingsArray.push(-uberXPrice);
      } else {
      totalSavingsArray.push(-uberXPrice);
      }

    //sum the items in the total savings array
    var totalSavings = totalSavingsArray.reduce(function (a,b) {
        return a + b;
        });

    document.getElementById("total-savings-calculator").innerHTML = "$" + totalSavings + ".00";
    
    //dynamically change css styling to match pos/neg values
    var totalSavingsCss = function (totalSavingsVar) {
      if (totalSavingsVar < 0) {
        var greenRed = document.getElementById("total-savings-calculator");
        greenRed.setAttribute("class", "total-savings-calculator-neg");
      } else {
        var greenRed = document.getElementById("total-savings-calculator");
        greenRed.setAttribute("class", "total-savings-calculator-pos");
        }
      }
    totalSavingsCss(totalSavings);

    //add to local storage to be able to retrieve later
    localStorage.setItem(Date.now(), totalSavings);
  } else if (uberXPrice < 0) {
    alert("Please enter an origin and destination to calculate!");
  }
}

bikeButton.addEventListener("click", addToSum);
uberButton.addEventListener("click", subtractFromSum);

//WEATHER OVERLAY TO ALERT USERS IF RECENT RAIN!
$.ajax({
  url: "https://api.forecast.io/forecast/fa31dc1ae9ac7c36d577dfbc9bbadf91/37.7833,-122.4167",
  dataType: "jsonp",
  success: function (data) {
    weatherParsed = data;
    
    function weatherUpdate (weatherObject) {
      if (weatherObject.hourly.icon == "rain") {
        weatherAlert.innerHTML =  "Be careful biking!! " + weatherObject.hourly.summary;
        weatherAlert.setAttribute("class", "weather-alert-neg")
        }
      };

     weatherUpdate(weatherParsed);
   }
});

//LOCAL STORAGE MANIPULATION: intent is to save the data from previous entries in order to keep a running total
var localStorageKeys = Object.keys(localStorage);

var findLargestKey = function (array) {
  var largest = 0;
  array.forEach(function(item){
    if (parseInt(item)>largest) {
    largest=parseInt(item);
    }
  });
  return largest;
};

var valueLargestKey = localStorage.getItem(findLargestKey(localStorageKeys))

if (localStorage.length != 0) {
  document.getElementById("total-savings-calculator").innerHTML = "$" + valueLargestKey + ".00";
  var localStorageCss = function (totalSavingsVar) {
  if (valueLargestKey < 0) {
    var greenRed = document.getElementById("total-savings-calculator");
    greenRed.setAttribute("class", "total-savings-calculator-neg");
  } else {
    var greenRed = document.getElementById("total-savings-calculator");
    greenRed.setAttribute("class", "total-savings-calculator-pos");
    }
  }
  localStorageCss(totalSavings);
  } else if (localStorage = 0) {
  document.getElementById("total-savings-calculator").innerHTML = "$" + "0.00";
}
