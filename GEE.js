/**
 * Ứng dụng phân tích ảnh Sentinel-2 theo kỳ 2 tháng
 * Tác giả: Khanhle19
 * Phiên bản: 2.4
 * Ngày: 2025-04-19
 * Tính năng mới: Sử dụng phương pháp reduce để bảo toàn band
 */

// Khởi tạo biến toàn cục
var aoi = null;
var startDate = null;
var endDate = null;
var bimonthlyCollection = null;
var selectedIndices = ['ndvi', 'ndwi', 'ndbi', 'bui', 'ui', 'baei', 'ebbi'];
var currentIndex = 'ndvi';
var currentPeriod = null;
var drawingTools = null;
var visiblePeriods = [];
var isInterpolationEnabled = true; // Bật tính năng nội suy mặc định
var currentCollection = null; // Biến lưu collection hiện tại

// Biến lưu trữ ảnh đã xử lý theo periodId
var processedImagesByPeriod = {};

// Tạo giao diện chính
var mainPanel = ui.Panel({
  style: {
    width: '360px',
    padding: '10px',
    maxHeight: '100%',
    backgroundColor: 'white'
  }
});

ui.root.insert(0, mainPanel);

// Tiêu đề ứng dụng
mainPanel.add(ui.Label({
  value: 'Phân tích ảnh Sentinel-2 theo kỳ 2 tháng',
  style: {
    fontSize: '18px',
    fontWeight: 'bold',
    margin: '0 0 10px 0',
    textAlign: 'center'
  }
}));

// Thêm phần hướng dẫn
mainPanel.add(ui.Label('1. Chọn khu vực nghiên cứu (vẽ hoặc nhập tọa độ)'));

// Panel cho vùng quan tâm (Area of Interest - AOI)
var aoiPanel = ui.Panel({
  layout: ui.Panel.Layout.flow('horizontal'),
  style: {margin: '5px 0'}
});

// Nút để kích hoạt công cụ vẽ
var drawButton = ui.Button({
  label: 'Vẽ vùng',
  onClick: function() {
    clearGeometry();
    drawingTools = Map.drawingTools();
    drawingTools.setShape('polygon');
    drawingTools.draw();
    drawingTools.onDraw(function(geometry) {
      aoi = geometry;
      updateAOITextbox();
      drawingTools.stop();
      Map.centerObject(aoi, 13);
    });
  }
});
aoiPanel.add(drawButton);

// Thêm nút để xóa vùng đã vẽ
var clearButton = ui.Button({
  label: 'Xóa vùng',
  onClick: clearGeometry
});
aoiPanel.add(clearButton);

mainPanel.add(aoiPanel);

// Hộp văn bản để hiển thị/nhập tọa độ
var aoiTextbox = ui.Textbox({
  placeholder: 'Nhập tọa độ: [[long1,lat1], [long2,lat2], ...]',
  onChange: function(text) {
    try {
      // Chuyển đổi văn bản thành tọa độ
      var coords = JSON.parse(text);
      if (Array.isArray(coords) && coords.length > 2) {
        aoi = ee.Geometry.Polygon(coords);
        addAoiToMap();
      }
    } catch (e) {
      showError('Lỗi nhập tọa độ: ' + e.message);
    }
  },
  style: {width: '95%'}
});
mainPanel.add(aoiTextbox);

// Phần chọn khoảng thời gian
mainPanel.add(ui.Label('2. Chọn khoảng thời gian'));

var datePanel = ui.Panel({
  layout: ui.Panel.Layout.flow('horizontal'),
  style: {margin: '5px 0'}
});

// Widget ngày bắt đầu
datePanel.add(ui.Label('Từ:', {margin: '0 8px 0 0'}));
var startDateTextbox = ui.Textbox({
  placeholder: 'YYYY-MM-DD',
  value: '2020-01-01',
  onChange: function(value) {
    startDate = value;
  },
  style: {width: '100px'}
});
datePanel.add(startDateTextbox);

// Widget ngày kết thúc
datePanel.add(ui.Label('Đến:', {margin: '0 8px 0 8px'}));
var endDateTextbox = ui.Textbox({
  placeholder: 'YYYY-MM-DD',
  value: '2022-12-31',
  onChange: function(value) {
    endDate = value;
  },
  style: {width: '100px'}
});
datePanel.add(endDateTextbox);

mainPanel.add(datePanel);

// Checkbox cho phép nội suy
var interpolationPanel = ui.Panel({
  layout: ui.Panel.Layout.flow('horizontal'),
  style: {margin: '5px 0'}
});

var interpolationCheckbox = ui.Checkbox({
  label: 'Nội suy các kỳ thiếu dữ liệu',
  value: isInterpolationEnabled,
  onChange: function(checked) {
    isInterpolationEnabled = checked;
  }
});
interpolationPanel.add(interpolationCheckbox);
mainPanel.add(interpolationPanel);

// Chọn chỉ số để hiển thị
mainPanel.add(ui.Label('3. Chọn chỉ số để hiển thị'));
var indexSelect = ui.Select({
  items: [
    {label: 'NDVI - Chỉ số thực vật', value: 'ndvi'},
    {label: 'NDWI - Chỉ số nước', value: 'ndwi'},
    {label: 'NDBI - Chỉ số đô thị', value: 'ndbi'},
    {label: 'BUI - Chỉ số xây dựng kết hợp', value: 'bui'},
    {label: 'UI - Chỉ số đô thị', value: 'ui'},
    {label: 'BAEI - Chỉ số trích xuất khu vực xây dựng', value: 'baei'},
    {label: 'EBBI - Chỉ số xây dựng và đất trống nâng cao', value: 'ebbi'},
    {label: 'Ảnh màu thực', value: 'rgb'}
  ],
  value: 'ndvi',
  onChange: function(value) {
    currentIndex = value;
    updateMapDisplay();
  }
});
mainPanel.add(indexSelect);

// Nút xử lý
var processButton = ui.Button({
  label: 'Xử lý ảnh',
  onClick: processImages,
  style: {margin: '10px 0', textAlign: 'center'}
});
mainPanel.add(processButton);

// Dropdown chọn kỳ 2 tháng
mainPanel.add(ui.Label('4. Chọn kỳ 2 tháng:'));
var periodSelect = ui.Select({
  placeholder: 'Chọn kỳ 2 tháng có sẵn',
  onChange: function(value) {
    if (value) {
      currentPeriod = value;
      updateMapDisplay();
    }
  },
  style: {width: '95%'}
});
mainPanel.add(periodSelect);

// Hiển thị thông tin kỳ hiện tại
var currentPeriodLabel = ui.Label('');
mainPanel.add(currentPeriodLabel);

// Panel thông tin hiện tại về dữ liệu
var dataInfoLabel = ui.Label('');
mainPanel.add(dataInfoLabel);

// Bảng thông tin và thông báo lỗi
var infoPanel = ui.Panel();
mainPanel.add(infoPanel);

// Nút để kiểm tra band có sẵn
var checkBandsButton = ui.Button({
  label: 'Kiểm tra band có sẵn',
  onClick: function() {
    if (!aoi) {
      showError('Vui lòng chọn khu vực nghiên cứu');
      return;
    }
    
    showLoading(true);
    var s2 = ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
      .filterBounds(aoi)
      .filterDate(startDateTextbox.getValue(), endDateTextbox.getValue())
      .first();
    
    s2.bandNames().evaluate(function(bands) {
      showLoading(false);
      if (bands && bands.length > 0) {
        showSuccess('Band có sẵn: ' + bands.join(', '));
      } else {
        showError('Không tìm thấy band nào trong ảnh.');
      }
    });
  }
});
mainPanel.add(checkBandsButton);

// Chỉ báo trạng thái đang tải
var loadingLabel = ui.Label({
  value: 'Đang tải...',
  style: {
    position: 'bottom-right',
    padding: '4px 8px',
    margin: '0px',
    color: 'white',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    fontSize: '14px',
    shown: false
  }
});
Map.add(loadingLabel);

// Hàm hiển thị/ẩn chỉ báo tải
function showLoading(show) {
  loadingLabel.style().set('shown', show);
}

// Hàm để vẽ vùng quan tâm lên bản đồ
function addAoiToMap() {
  Map.layers().reset();
  if (aoi) {
    Map.addLayer(aoi, {color: 'red'}, 'Vùng nghiên cứu');
    Map.centerObject(aoi, 13);
  }
}

// Hàm để xóa vùng đã vẽ
function clearGeometry() {
  aoi = null;
  aoiTextbox.setValue(null);
  Map.layers().reset();
  if (drawingTools !== null) {
    drawingTools.layers().reset();
  }
}

// Hàm cập nhật hộp văn bản AOI từ geometry đã vẽ
function updateAOITextbox() {
  try {
    // Lấy tọa độ từ geometry và hiển thị trong hộp văn bản
    var coordinates = aoi.coordinates().getInfo();
    aoiTextbox.setValue(JSON.stringify(coordinates));
  } catch (e) {
    showError('Lỗi khi cập nhật tọa độ: ' + e.message);
  }
}

// Hàm xử lý ảnh chính
function processImages() {
  // Kiểm tra đầu vào
  if (!aoi) {
    showError('Vui lòng chọn khu vực nghiên cứu');
    return;
  }
  
  if (!startDate || !endDate) {
    startDate = startDateTextbox.getValue();
    endDate = endDateTextbox.getValue();
  }
  
  // Reset biến lưu trữ ảnh
  processedImagesByPeriod = {};
  
  // Hiển thị thông báo đang xử lý
  infoPanel.clear();
  showInfo('Đang xử lý dữ liệu...');
  showLoading(true);
  
  // Tải collection Sentinel-2
  var s2 = ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
    .filterBounds(aoi)
    .filterDate(startDate, endDate)
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 40)); 
  
  // Lưu lại collection hiện tại
  currentCollection = s2;
  
  // Kiểm tra có ảnh không
  s2.size().evaluate(function(size) {
    if (size === 0) {
      showLoading(false);
      showError('Không tìm thấy ảnh phù hợp cho khu vực và thời gian đã chọn');
      return;
    }
    
    // Hiển thị số ảnh tìm thấy
    infoPanel.clear();
    showInfo('Tìm thấy ' + size + ' ảnh. Đang xử lý...');
    
    // Tiếp tục xử lý nếu có ảnh
    createBimonthlyComposites(s2);
  });
}

// Hàm tạo ảnh đại diện cho mỗi kỳ 2 tháng
function createBimonthlyComposites(collection) {
  // Lấy thời gian bắt đầu và kết thúc
  var start = ee.Date(startDate);
  var end = ee.Date(endDate);
  
  // Tính số tháng giữa ngày bắt đầu và kết thúc
  var months = end.difference(start, 'month').round();
  
  // Tạo danh sách các kỳ 2 tháng
  var bimonthlyPeriods = ee.List.sequence(0, months, 2).map(function(offset) {
    var startPeriod = start.advance(offset, 'month');
    var endPeriod = startPeriod.advance(2, 'month');
    
    // Đảm bảo không vượt quá ngày kết thúc
    endPeriod = ee.Date(ee.Algorithms.If(
      endPeriod.millis().gt(end.millis()),
      end,
      endPeriod
    ));
    
    return ee.Feature(null, {
      'start_date': startPeriod.format('YYYY-MM-dd'),
      'end_date': endPeriod.format('YYYY-MM-dd'),
      'period_id': startPeriod.format('YYYY-MM'),
      'display_name': startPeriod.format('YYYY-MM (')
        .cat(ee.String(startPeriod.get('month').add(1)))
        .cat(')')
    });
  });
  
  // Đánh giá các kỳ
  bimonthlyPeriods.evaluate(function(periods) {
    // Kiểm tra dữ liệu sau khi evaluate
    if (!periods || periods.length === 0) {
      showLoading(false);
      showError('Không thể tạo kỳ 2 tháng từ khoảng thời gian đã chọn.');
      return;
    }
    
    // Tạo mảng để lưu các kỳ có sẵn
    var availablePeriods = [];
    var allPeriods = [];
    
    // Lưu lại thông tin tất cả các kỳ
    periods.forEach(function(period) {
      if (period && period.properties) {
        allPeriods.push({
          periodId: period.properties.period_id,
          startDate: period.properties.start_date,
          endDate: period.properties.end_date,
          displayName: period.properties.display_name,
          hasData: false,
          count: 0
        });
      }
    });
    
    // Kiểm tra từng kỳ và tìm những kỳ có dữ liệu
    processPeriodBatch(collection, allPeriods, 0, availablePeriods);
  });
}

// Hàm xử lý theo lô các kỳ (để tránh quá nhiều tác vụ bất đồng bộ cùng lúc)
function processPeriodBatch(collection, allPeriods, index, availablePeriods) {
  // Nếu đã xử lý tất cả các kỳ
  if (index >= allPeriods.length) {
    if (availablePeriods.length === 0) {
      showLoading(false);
      showError('Không có kỳ nào có đủ dữ liệu. Hãy thử khoảng thời gian khác.');
      return;
    }
    
    // Nếu bật chế độ nội suy và có ít nhất 2 kỳ có dữ liệu
    if (isInterpolationEnabled && availablePeriods.length >= 2) {
      interpolateMissingPeriods(collection, allPeriods, availablePeriods);
    } else {
      // Cập nhật UI chỉ với các kỳ có sẵn (không nội suy)
      updatePeriodUI(collection, availablePeriods);
    }
    return;
  }
  
  var period = allPeriods[index];
  
  // Tính số ảnh cho kỳ này
  collection.filterDate(period.startDate, period.endDate)
    .size()
    .evaluate(function(count) {
      if (count > 0) {
        period.hasData = true;
        period.count = count;
        availablePeriods.push(period);
      }
      
      // Xử lý tiếp kỳ tiếp theo
      processPeriodBatch(collection, allPeriods, index + 1, availablePeriods);
    });
}

// Hàm nội suy cho các kỳ thiếu dữ liệu
function interpolateMissingPeriods(collection, allPeriods, availablePeriods) {
  // Sắp xếp các kỳ có sẵn theo thời gian
  availablePeriods.sort(function(a, b) {
    return new Date(a.startDate) - new Date(b.startDate);
  });
  
  // Sắp xếp tất cả các kỳ theo thời gian
  allPeriods.sort(function(a, b) {
    return new Date(a.startDate) - new Date(b.startDate);
  });
  
  // Danh sách các kỳ cần nội suy
  var periodsToInterpolate = [];
  
  // Tìm các kỳ cần nội suy
  allPeriods.forEach(function(period) {
    if (!period.hasData) {
      // Tìm kỳ gần nhất có dữ liệu trước và sau
      var prevPeriod = null;
      var nextPeriod = null;
      
      for (var i = 0; i < availablePeriods.length; i++) {
        var availablePeriod = availablePeriods[i];
        if (new Date(availablePeriod.startDate) < new Date(period.startDate)) {
          prevPeriod = availablePeriod;
        }
        if (new Date(availablePeriod.startDate) > new Date(period.startDate) && !nextPeriod) {
          nextPeriod = availablePeriod;
          break;
        }
      }
      
      // Nếu có cả kỳ trước và kỳ sau, thêm vào danh sách nội suy
      if (prevPeriod && nextPeriod) {
        periodsToInterpolate.push({
          period: period,
          prevPeriod: prevPeriod,
          nextPeriod: nextPeriod
        });
      }
    }
  });
  
  // Không có kỳ nào cần nội suy hoặc không thể nội suy
  if (periodsToInterpolate.length === 0) {
    updatePeriodUI(collection, availablePeriods);
    return;
  }
  
  // Thực hiện nội suy tuần tự
  interpolateNextPeriod(collection, periodsToInterpolate, 0, availablePeriods);
}

// Hàm nội suy cho từng kỳ thiếu - sử dụng dữ liệu từ kỳ gần nhất
function interpolateNextPeriod(collection, periodsToInterpolate, index, availablePeriods) {
  if (index >= periodsToInterpolate.length) {
    // Đã hoàn thành nội suy, cập nhật UI
    updatePeriodUI(collection, availablePeriods);
    return;
  }
  
  var item = periodsToInterpolate[index];
  var period = item.period;
  var prevPeriod = item.prevPeriod;
  var nextPeriod = item.nextPeriod;
  
  showInfo('Đang nội suy kỳ ' + period.displayName + '...');
  
  // Quyết định sử dụng kỳ nào - ở đây tôi sử dụng kỳ gần nhất
  var closerPeriod;
  var prevTime = new Date(prevPeriod.startDate).getTime();
  var currentTime = new Date(period.startDate).getTime();
  var nextTime = new Date(nextPeriod.startDate).getTime();
  
  // Xác định kỳ nào gần hơn
  if ((currentTime - prevTime) <= (nextTime - currentTime)) {
    closerPeriod = prevPeriod;
    showInfo('Sử dụng dữ liệu từ kỳ trước: ' + prevPeriod.displayName);
  } else {
    closerPeriod = nextPeriod;
    showInfo('Sử dụng dữ liệu từ kỳ sau: ' + nextPeriod.displayName);
  }
  
  // Dùng toàn bộ collection thay vì median để giữ cấu trúc band
  var sourceCollection = collection.filterDate(closerPeriod.startDate, closerPeriod.endDate);
  
  sourceCollection.size().evaluate(function(size) {
    if (size === 0) {
      showError('Không tìm thấy ảnh cho kỳ ' + closerPeriod.displayName);
      interpolateNextPeriod(collection, periodsToInterpolate, index + 1, availablePeriods);
      return;
    }
    
    // Tạo ảnh đại diện cho kỳ này bằng phương pháp reduce
    createMedianImage(sourceCollection, function(sourceImage) {
      if (!sourceImage) {
        showError('Không thể tạo ảnh đại diện cho kỳ ' + closerPeriod.displayName);
        interpolateNextPeriod(collection, periodsToInterpolate, index + 1, availablePeriods);
        return;
      }
      
      // Thêm thông tin chỉ số cho kỳ này
      computeIndices(sourceImage, function(finalImage) {
        if (finalImage) {
          // Cập nhật thông tin cho kỳ được nội suy
          finalImage = finalImage
            .set('period_id', period.periodId)
            .set('display_name', period.displayName)
            .set('interpolated', true)
            .set('source_period', closerPeriod.periodId)
            .set('system:time_start', currentTime);
          
          // Lưu ảnh vào biến toàn cục
          processedImagesByPeriod[period.periodId] = finalImage;
          
          // Cập nhật thông tin period
          period.hasData = true;
          period.interpolated = true;
          period.count = 0;
          period.sourcePeriod = closerPeriod.periodId;
          availablePeriods.push(period);
        }
        
        // Chuyển sang kỳ tiếp theo
        interpolateNextPeriod(collection, periodsToInterpolate, index + 1, availablePeriods);
      });
    });
  });
}

// Hàm tạo ảnh đại diện bằng mosaic thay vì median
function createMedianImage(collection, callback) {
  // Lấy ảnh đầu tiên để lấy tên các band có sẵn
  collection.first().bandNames().evaluate(function(bands) {
    if (!bands || bands.length === 0) {
      callback(null);
      return;
    }

    try {
      var bandsToProcess = ['B2', 'B3', 'B4', 'B8', 'B8A', 'B11', 'B12'];
      var availableBands = bandsToProcess.filter(function(b) {
        return bands.indexOf(b) !== -1;
      });

      if (availableBands.length === 0) {
        callback(null);
        return;
      }

      // Sắp xếp để ảnh ít mây trước nếu có metadata
      var sortedCollection = collection;
      if (collection.first().propertyNames().contains('CLOUDY_PIXEL_PERCENTAGE')) {
        sortedCollection = collection.sort('CLOUDY_PIXEL_PERCENTAGE');
      }

      var mosaicImage = sortedCollection.select(availableBands).mosaic();
      callback(mosaicImage);
    } catch (e) {
      showError('Lỗi khi tạo ảnh mosaic: ' + e.message);
      callback(null);
    }
  });
}

// Hàm tính toán các chỉ số từ ảnh
function computeIndices(image, callback) {
  // Kiểm tra band đã có và tính toán các chỉ số
  image.bandNames().evaluate(function(bands) {
    if (!bands || bands.length === 0) {
      callback(null);
      return;
    }
    
    try {
      var finalImage = image;
      
      // Tính NDVI nếu có cả band B8 và B4
      if (bands.indexOf('B8') !== -1 && bands.indexOf('B4') !== -1) {
        var ndvi = image.normalizedDifference(['B8', 'B4']).rename('ndvi');
        finalImage = finalImage.addBands(ndvi);
      }
      
      // Tính NDWI nếu có cả band B3 và B8
      if (bands.indexOf('B3') !== -1 && bands.indexOf('B8') !== -1) {
        var ndwi = image.normalizedDifference(['B3', 'B8']).rename('ndwi');
        finalImage = finalImage.addBands(ndwi);
      }
      
      // Tính NDBI nếu có cả band B11 và B8
      if (bands.indexOf('B11') !== -1 && bands.indexOf('B8') !== -1) {
        var ndbi = image.normalizedDifference(['B11', 'B8']).rename('ndbi');
        finalImage = finalImage.addBands(ndbi);
      }
      
      // Đảm bảo các band đã được cập nhật trước khi tính các chỉ số phụ thuộc
      var updatedBands = finalImage.bandNames().getInfo();
      
      // Tính BUI = NDBI - NDVI nếu đã có cả NDBI và NDVI
      if (updatedBands.indexOf('ndbi') !== -1 && updatedBands.indexOf('ndvi') !== -1) {
        var ndbi_for_bui = finalImage.select('ndbi');
        var ndvi_for_bui = finalImage.select('ndvi');
        var bui = ndbi_for_bui.subtract(ndvi_for_bui).rename('bui');
        finalImage = finalImage.addBands(bui);
      }
      
      // Chỉ số UI (Urban Index): UI = (SWIR2 - NIR) / (SWIR2 + NIR)
      // B12 = SWIR2, B8 = NIR
      if (bands.indexOf('B12') !== -1 && bands.indexOf('B8') !== -1) {
        var ui = image.normalizedDifference(['B12', 'B8']).rename('ui');
        finalImage = finalImage.addBands(ui);
      }
      
      // Chỉ số BAEI (Built-up Area Extraction Index)
      if (bands.indexOf('B4') !== -1 && bands.indexOf('B3') !== -1 && 
          bands.indexOf('B8') !== -1 && bands.indexOf('B2') !== -1) {
        
        var red_plus_green = image.select('B4').add(image.select('B3'));
        var nir_plus_blue = image.select('B8').add(image.select('B2'));
        
        var baei_numerator = red_plus_green.subtract(nir_plus_blue);
        var baei_denominator = red_plus_green.add(nir_plus_blue);
        
        var baei = baei_numerator.divide(baei_denominator).rename('baei');
        finalImage = finalImage.addBands(baei);
      }
      
      // Chỉ số EBBI (Enhanced Built-up and Bareness Index)
      if (bands.indexOf('B11') !== -1 && bands.indexOf('B8') !== -1 && bands.indexOf('B12') !== -1) {
        var swir1_minus_nir = image.select('B11').subtract(image.select('B8'));
        var swir1_plus_swir2 = image.select('B11').add(image.select('B12'));
        
        // Lấy căn bậc hai của swir1_plus_swir2 - thêm một giá trị nhỏ để tránh lỗi với pixel 0
        var sqrt_term = swir1_plus_swir2.add(ee.Image.constant(0.0001)).sqrt();
        
        // Tính EBBI
        var ebbi = swir1_minus_nir.divide(sqrt_term.multiply(10)).rename('ebbi');
        finalImage = finalImage.addBands(ebbi);
      }
      
      callback(finalImage);
    } catch (e) {
      showError('Lỗi khi tính toán chỉ số: ' + e.message);
      callback(null);
    }
  });
}

// Cập nhật UI với các kỳ có sẵn và kỳ nội suy
function updatePeriodUI(collection, periods) {
  // Sắp xếp các kỳ theo thời gian
  periods.sort(function(a, b) {
    return new Date(a.startDate) - new Date(b.startDate);
  });
  
  // Cập nhật danh sách dropdown
  var items = periods.map(function(period) {
    var label = period.displayName;
    if (period.interpolated) {
      if (period.sourcePeriod) {
        label += ' (nội suy từ ' + period.sourcePeriod + ')';
      } else {
        label += ' (nội suy)';
      }
    } else {
      label += ' (' + period.count + ' ảnh)';
    }
    
    return {
      label: label,
      value: period.periodId
    };
  });
  
  periodSelect.items().reset(items);
  
  // Nếu có kỳ, chọn kỳ đầu tiên
  if (items.length > 0) {
        periodSelect.setValue(items[0].value);
  }
  
  // Xử lý các ảnh cho các kỳ
  createBimonthlyImages(collection, periods);
}

// Hàm tạo ảnh cho mỗi kỳ 2 tháng
function createBimonthlyImages(collection, periods) {
  // Mảng để lưu các ảnh đã xử lý
  var processedImages = [];
  
  // Xử lý từng kỳ theo thứ tự
  processImageBatch(collection, periods, 0, processedImages);
}

// Hàm xử lý theo lô các ảnh (để tránh quá nhiều tác vụ bất đồng bộ cùng lúc)
function processImageBatch(collection, periods, index, processedImages) {
  // Nếu đã xử lý tất cả các kỳ
  if (index >= periods.length) {
    if (processedImages.length === 0) {
      showLoading(false);
      showError('Không có dữ liệu ảnh nào được xử lý thành công.');
      return;
    }
    
    bimonthlyCollection = ee.ImageCollection.fromImages(processedImages);
    
    // Hiển thị thành công
    showLoading(false);
    
    // Đếm số kỳ nội suy
    var interpolatedCount = 0;
    periods.forEach(function(period) {
      if (period.interpolated) {
        interpolatedCount++;
      }
    });
    
    var realCount = periods.length - interpolatedCount;
    
    showSuccess('Đã xử lý xong! Có ' + realCount + 
               ' kỳ 2 tháng có dữ liệu thực và ' + interpolatedCount + 
               ' kỳ được nội suy.');
    
    // Hiển thị kỳ đầu tiên
    updateMapDisplay();
    return;
  }
  
  var period = periods[index];
  showInfo('Đang xử lý kỳ ' + period.displayName + '...');
  
  // Nếu đã có ảnh được lưu trong biến toàn cục, sử dụng nó
  if (processedImagesByPeriod[period.periodId]) {
    processedImages.push(processedImagesByPeriod[period.periodId]);
    processImageBatch(collection, periods, index + 1, processedImages);
    return;
  }
  
  // Nếu đây là kỳ nội suy, bỏ qua (đã được xử lý trong hàm interpolateNextPeriod)
  if (period.interpolated) {
    processImageBatch(collection, periods, index + 1, processedImages);
    return;
  }
  
  // Nếu không, xử lý ảnh mới
  var periodCollection = collection.filterDate(period.startDate, period.endDate);
  
  periodCollection.size().evaluate(function(size) {
    if (size > 0) {
      // Sử dụng phương pháp reduce để tạo median thay vì median() trực tiếp
      createMedianImage(periodCollection, function(medianImage) {
        if (medianImage) {
          // Tính toán các chỉ số
          computeIndices(medianImage, function(finalImage) {
            if (finalImage) {
              // Thêm metadata
              finalImage = finalImage
                .set('period_id', period.periodId)
                .set('display_name', period.displayName)
                .set('interpolated', false)
                .set('system:time_start', new Date(period.startDate).getTime());
              
              // Lưu ảnh vào biến toàn cục
              processedImagesByPeriod[period.periodId] = finalImage;
              
              // Thêm vào mảng ảnh đã xử lý
              processedImages.push(finalImage);
              
              showInfo('Đã xử lý kỳ ' + period.displayName + ' thành công.');
            } else {
              showInfo('Không thể tính toán chỉ số cho kỳ ' + period.displayName);
            }
            
            // Xử lý kỳ tiếp theo
            processImageBatch(collection, periods, index + 1, processedImages);
          });
        } else {
          showInfo('Bỏ qua kỳ ' + period.displayName + ' vì không thể tạo ảnh đại diện');
          processImageBatch(collection, periods, index + 1, processedImages);
        }
      });
    } else {
      showInfo('Bỏ qua kỳ ' + period.displayName + ' vì không có dữ liệu.');
      processImageBatch(collection, periods, index + 1, processedImages);
    }
  });
}

// Hàm cập nhật hiển thị bản đồ dựa trên kỳ và chỉ số được chọn
function updateMapDisplay() {
  if (!currentPeriod) {
    showError('Chưa chọn kỳ nào.');
    return;
  }
  
  showLoading(true);
  
  // Lấy ảnh trực tiếp từ biến toàn cục
  var periodImage = processedImagesByPeriod[currentPeriod];
  
  if (!periodImage) {
    // Nếu không tìm thấy trong biến toàn cục, thử lấy từ collection
    if (bimonthlyCollection) {
      bimonthlyCollection
        .filter(ee.Filter.eq('period_id', currentPeriod))
        .first()
        .evaluate(function(result) {
          if (result) {
            var image = ee.Image(result.id);
            // Lưu vào biến toàn cục để sử dụng sau này
            processedImagesByPeriod[currentPeriod] = image;
            displayImage(image);
          } else {
            showLoading(false);
            showError('Không thể hiển thị kỳ này. Không tìm thấy dữ liệu hợp lệ.');
          }
        });
    } else {
      showLoading(false);
      showError('Chưa có dữ liệu được xử lý. Vui lòng nhấn "Xử lý ảnh" trước.');
    }
    return;
  }
  
  displayImage(periodImage);
}

// Hàm hiển thị ảnh với thông tin chi tiết - phiên bản đơn giản hóa
function displayImage(image) {
  try {
    // Kiểm tra xem image có tồn tại không
    if (!image) {
      showLoading(false);
      showError('Không tìm thấy ảnh để hiển thị.');
      return;
    }
    
    // Kiểm tra band trước khi hiển thị
    image.bandNames().evaluate(function(bandNames) {
      if (!bandNames || bandNames.length === 0) {
        showLoading(false);
        showError('Ảnh không có band nào.');
        return;
      }
      
      // Hiển thị danh sách band (trợ giúp debug)
      console.log('Các band có sẵn:', bandNames);
      
      // Lấy thông tin cơ bản của ảnh từ dropdown
      var displayName = currentPeriod;
      var isInterpolated = false;
      var sourcePeriod = "";
      
      var periodItems = periodSelect.items().getJsArray();
      for (var i = 0; i < periodItems.length; i++) {
        if (periodItems[i].value === currentPeriod) {
          displayName = periodItems[i].label.split(' (')[0];
          isInterpolated = periodItems[i].label.indexOf('nội suy') > -1;
          
          // Trích xuất nguồn gốc nội suy nếu có
          if (isInterpolated && periodItems[i].label.indexOf('nội suy từ') > -1) {
            var match = periodItems[i].label.match(/nội suy từ (\d{4}-\d{2})/);
            if (match && match[1]) {
              sourcePeriod = match[1];
            }
          }
          break;
        }
      }
      
      // Cập nhật nhãn kỳ hiện tại
      var label = 'Đang hiển thị: ' + displayName;
      if (isInterpolated) {
        if (sourcePeriod) {
          label += ' (dữ liệu từ ' + sourcePeriod + ')';
        } else {
          label += ' (dữ liệu nội suy)';
        }
      }
      currentPeriodLabel.setValue(label);
      
      // Hiển thị ảnh trên bản đồ
      Map.layers().reset();
      Map.addLayer(aoi, {color: 'red'}, 'Vùng nghiên cứu');
      
      // Xác định band cần thiết cho chỉ số hiện tại
      var missingBands = [];
      
      if (currentIndex === 'rgb') {
        // Kiểm tra các band RGB có tồn tại không
        var rgbBands = ['B4', 'B3', 'B2'];
        rgbBands.forEach(function(band) {
          if (bandNames.indexOf(band) === -1) {
            missingBands.push(band);
          }
        });
        
        if (missingBands.length === 0) {
          Map.addLayer(image.clip(aoi), 
            {bands: ['B4', 'B3', 'B2'], min: 0, max: 3000}, 
            'Ảnh màu thực - ' + displayName);
          
          dataInfoLabel.setValue('Hiển thị ảnh màu thực (R-G-B)');
        } else {
          showError('Ảnh thiếu các band cần thiết cho hiển thị màu thực: ' + missingBands.join(', '));
        }
      } 
      else if (currentIndex === 'ndvi') {
        // Code hiện tại cho NDVI
        if (bandNames.indexOf('ndvi') !== -1) {
          var ndviPalette = ['FFFFFF', 'CE7E45', 'DF923D', 'F1B555', 'FCD163', '99B718',
                         '74A901', '66A000', '529400', '3E8601', '207401', '056201',
                         '004C00', '023B01', '012E01', '011D01', '011301'];
          
          Map.addLayer(image.select('ndvi').clip(aoi), 
            {min: -0.2, max: 0.8, palette: ndviPalette}, 
            'NDVI - ' + displayName);
          
          dataInfoLabel.setValue('NDVI: Chỉ số thực vật [-1,1]');
        } else if (bandNames.indexOf('B8') !== -1 && bandNames.indexOf('B4') !== -1) {
          var ndvi = image.normalizedDifference(['B8', 'B4']).rename('ndvi');
          var ndviPalette = ['FFFFFF', 'CE7E45', 'DF923D', 'F1B555', 'FCD163', '99B718',
                         '74A901', '66A000', '529400', '3E8601', '207401', '056201',
                         '004C00', '023B01', '012E01', '011D01', '011301'];
          
          Map.addLayer(ndvi.clip(aoi), 
            {min: -0.2, max: 0.8, palette: ndviPalette}, 
            'NDVI - ' + displayName);
          
          dataInfoLabel.setValue('NDVI: Chỉ số thực vật [-1,1]');
        } else {
          if (bandNames.indexOf('B8') === -1) missingBands.push('B8');
          if (bandNames.indexOf('B4') === -1) missingBands.push('B4');
          showError('Ảnh thiếu band cần thiết cho tính toán NDVI: ' + missingBands.join(', '));
        }
      } 
      else if (currentIndex === 'ndwi') {
        // Code hiện tại cho NDWI
        if (bandNames.indexOf('ndwi') !== -1) {
          Map.addLayer(image.select('ndwi').clip(aoi), 
            {min: -0.5, max: 0.5, palette: ['red', 'white', 'blue']}, 
            'NDWI - ' + displayName);
          
          dataInfoLabel.setValue('NDWI: Chỉ số nước [-1,1]');
        } else if (bandNames.indexOf('B3') !== -1 && bandNames.indexOf('B8') !== -1) {
          var ndwi = image.normalizedDifference(['B3', 'B8']).rename('ndwi');
          Map.addLayer(ndwi.clip(aoi), 
            {min: -0.5, max: 0.5, palette: ['red', 'white', 'blue']}, 
            'NDWI - ' + displayName);
          
          dataInfoLabel.setValue('NDWI: Chỉ số nước [-1,1]');
        } else {
          if (bandNames.indexOf('B3') === -1) missingBands.push('B3');
          if (bandNames.indexOf('B8') === -1) missingBands.push('B8');
          showError('Ảnh thiếu band cần thiết cho tính toán NDWI: ' + missingBands.join(', '));
        }
      } 
      else if (currentIndex === 'ndbi') {
        // Code hiện tại cho NDBI
        if (bandNames.indexOf('ndbi') !== -1) {
          Map.addLayer(image.select('ndbi').clip(aoi), 
            {min: -0.5, max: 0.5, palette: ['green', 'white', 'brown']}, 
            'NDBI - ' + displayName);
          
          dataInfoLabel.setValue('NDBI: Chỉ số đô thị [-1,1]');
        } else if (bandNames.indexOf('B11') !== -1 && bandNames.indexOf('B8') !== -1) {
          var ndbi = image.normalizedDifference(['B11', 'B8']).rename('ndbi');
          Map.addLayer(ndbi.clip(aoi), 
            {min: -0.5, max: 0.5, palette: ['green', 'white', 'brown']}, 
            'NDBI - ' + displayName);
          
          dataInfoLabel.setValue('NDBI: Chỉ số đô thị [-1,1]');
        } else {
          if (bandNames.indexOf('B11') === -1) missingBands.push('B11');
          if (bandNames.indexOf('B8') === -1) missingBands.push('B8');
          showError('Ảnh thiếu band cần thiết cho tính toán NDBI: ' + missingBands.join(', '));
        }
      }
      // Phần hiển thị cho BUI
      else if (currentIndex === 'bui') {
        if (bandNames.indexOf('bui') !== -1) {
          Map.addLayer(image.select('bui').clip(aoi), 
            {min: -1, max: 1, palette: ['blue', 'white', 'red']}, 
            'BUI - ' + displayName);
          
          dataInfoLabel.setValue('BUI: Chỉ số xây dựng kết hợp [-2,2]');
        } else if (bandNames.indexOf('ndbi') !== -1 && bandNames.indexOf('ndvi') !== -1) {
          // Tính toán BUI trực tiếp khi hiển thị nếu có NDBI và NDVI
          var ndbi = image.select('ndbi');
          var ndvi = image.select('ndvi');
          var bui = ndbi.subtract(ndvi).rename('bui');
          
          Map.addLayer(bui.clip(aoi), 
            {min: -1, max: 1, palette: ['blue', 'white', 'red']}, 
            'BUI - ' + displayName);
          
          dataInfoLabel.setValue('BUI: Chỉ số xây dựng kết hợp [-2,2] (tính toán trực tiếp)');
        } else {
          var missingBands = [];
          if (bandNames.indexOf('ndbi') === -1) missingBands.push('ndbi');
          if (bandNames.indexOf('ndvi') === -1) missingBands.push('ndvi');
          showError('Ảnh thiếu chỉ số cần thiết cho BUI: ' + missingBands.join(', '));
        }
      }
      
      // Phần hiển thị cho UI
      else if (currentIndex === 'ui') {
        if (bandNames.indexOf('ui') !== -1) {
          Map.addLayer(image.select('ui').clip(aoi), 
            {min: -0.4, max: 0.4, palette: ['green', 'white', 'purple']}, 
            'UI - ' + displayName);
          
          dataInfoLabel.setValue('UI: Chỉ số đô thị [-1,1]');
        } else if (bandNames.indexOf('B12') !== -1 && bandNames.indexOf('B8') !== -1) {
          // Tính toán UI trực tiếp khi hiển thị
          var ui = image.normalizedDifference(['B12', 'B8']).rename('ui');
          
          Map.addLayer(ui.clip(aoi), 
            {min: -0.4, max: 0.4, palette: ['green', 'white', 'purple']}, 
            'UI - ' + displayName);
          
          dataInfoLabel.setValue('UI: Chỉ số đô thị [-1,1] (tính toán trực tiếp)');
        } else {
          var missingBands = [];
          if (bandNames.indexOf('B12') === -1) missingBands.push('B12');
          if (bandNames.indexOf('B8') === -1) missingBands.push('B8');
          showError('Ảnh thiếu band cần thiết cho tính toán UI: ' + missingBands.join(', '));
        }
      }
      // Phần hiển thị cho BAEI
      else if (currentIndex === 'baei') {
        if (bandNames.indexOf('baei') !== -1) {
          Map.addLayer(image.select('baei').clip(aoi), 
            {min: -0.3, max: 0.3, palette: ['green', 'white', 'orange']}, 
            'BAEI - ' + displayName);
          
          dataInfoLabel.setValue('BAEI: Chỉ số trích xuất khu vực xây dựng [-1,1]');
        } else if (bandNames.indexOf('B4') !== -1 && bandNames.indexOf('B3') !== -1 && 
                   bandNames.indexOf('B8') !== -1 && bandNames.indexOf('B2') !== -1) {
          // Tính toán BAEI trực tiếp khi hiển thị
          var red_plus_green = image.select('B4').add(image.select('B3'));
          var nir_plus_blue = image.select('B8').add(image.select('B2'));
          var baei_numerator = red_plus_green.subtract(nir_plus_blue);
          var baei_denominator = red_plus_green.add(nir_plus_blue);
          var baei = baei_numerator.divide(baei_denominator).rename('baei');
          
          Map.addLayer(baei.clip(aoi), 
            {min: -0.3, max: 0.3, palette: ['green', 'white', 'orange']}, 
            'BAEI - ' + displayName);
          
          dataInfoLabel.setValue('BAEI: Chỉ số trích xuất khu vực xây dựng [-1,1] (tính toán trực tiếp)');
        } else {
          var missingBands = [];
          if (bandNames.indexOf('B4') === -1) missingBands.push('B4');
          if (bandNames.indexOf('B3') === -1) missingBands.push('B3');
          if (bandNames.indexOf('B8') === -1) missingBands.push('B8');
          if (bandNames.indexOf('B2') === -1) missingBands.push('B2');
          showError('Ảnh thiếu band cần thiết cho tính toán BAEI: ' + missingBands.join(', '));
        }
      }
      // Phần hiển thị cho EBBI
      else if (currentIndex === 'ebbi') {
        if (bandNames.indexOf('ebbi') !== -1) {
          Map.addLayer(image.select('ebbi').clip(aoi), 
            {min: -0.2, max: 0.5, palette: ['green', 'yellow', 'red']}, 
            'EBBI - ' + displayName);
          
          dataInfoLabel.setValue('EBBI: Chỉ số xây dựng và đất trống nâng cao [-1,1]');
        } else if (bandNames.indexOf('B11') !== -1 && bandNames.indexOf('B8') !== -1 && bandNames.indexOf('B12') !== -1) {
          // Tính toán EBBI trực tiếp khi hiển thị
          var swir1_minus_nir = image.select('B11').subtract(image.select('B8'));
          var swir1_plus_swir2 = image.select('B11').add(image.select('B12'));
          var sqrt_term = swir1_plus_swir2.add(ee.Image.constant(0.0001)).sqrt();
          var ebbi = swir1_minus_nir.divide(sqrt_term.multiply(10)).rename('ebbi');
          
          Map.addLayer(ebbi.clip(aoi), 
            {min: -0.2, max: 0.5, palette: ['green', 'yellow', 'red']}, 
            'EBBI - ' + displayName);
          
          dataInfoLabel.setValue('EBBI: Chỉ số xây dựng và đất trống nâng cao [-1,1] (tính toán trực tiếp)');
        } else {
          var missingBands = [];
          if (bandNames.indexOf('B11') === -1) missingBands.push('B11');
          if (bandNames.indexOf('B8') === -1) missingBands.push('B8');
          if (bandNames.indexOf('B12') === -1) missingBands.push('B12');
          showError('Ảnh thiếu band cần thiết cho tính toán EBBI: ' + missingBands.join(', '));
        }
      }
      
      if (isInterpolated) {
        dataInfoLabel.setValue(dataInfoLabel.getValue() + ' (nội suy' + 
          (sourcePeriod ? ' từ ' + sourcePeriod : '') + ')');
      }
      
      showLoading(false);
    });
  } catch (e) {
    showLoading(false);
    showError('Lỗi khi hiển thị ảnh: ' + e.message);
  }
}

//===============================================================================================//

// === BỔ SUNG: PHÂN TÍCH CHUỖI THỜI GIAN PIXEL ===

// Panel hiển thị biểu đồ - Đặt ở bên phải
var chartPanel = ui.Panel({
  style: {
    width: '360px',
    height: '100%', 
    padding: '10px',
    shown: false
  }
});
ui.root.add(chartPanel);

// Tạo nút để kích hoạt chế độ phân tích pixel
var pixelAnalysisButton = ui.Button({
  label: 'Kích hoạt chế độ phân tích pixel',
  onClick: function() {
    // Kiểm tra đã xử lý dữ liệu chưa
    if (!bimonthlyCollection) {
      showError('Vui lòng xử lý ảnh trước khi phân tích pixel');
      return;
    }
    
    showInfo('Đã kích hoạt chế độ phân tích pixel. Nhấp vào bất kỳ điểm nào trên bản đồ để xem chuỗi thời gian.');
    
    // Thêm trình lắng nghe click trên bản đồ
    Map.onClick(function(coords) {
      analyzePixelTimeSeries(coords.lon, coords.lat);
    });
    
    // Hiển thị panel biểu đồ
    chartPanel.style().set('shown', true);
  }
});

// Thêm nút vào giao diện
mainPanel.add(ui.Label('5. Phân tích chuỗi thời gian pixel', {margin: '10px 0 5px 0'}));
mainPanel.add(pixelAnalysisButton);

// Hàm phân tích chuỗi thời gian pixel
function analyzePixelTimeSeries(lon, lat) {
  // Hiển thị thông báo đang xử lý
  showLoading(true);
  showInfo('Đang trích xuất dữ liệu chuỗi thời gian...');
  
  // Tạo điểm từ tọa độ
  var point = ee.Geometry.Point([lon, lat]);
  
  // Tạo vùng đệm vuông 30x30m xung quanh điểm
  // Sử dụng buffer nhỏ trước rồi lấy bounds để tạo ô vuông
  var buffer = point.buffer(15).bounds(); // Buffer 15m rồi lấy bounds sẽ tạo ô vuông ~30x30m
  
  // Thêm điểm và vùng đệm vào bản đồ
  Map.layers().set(1, ui.Map.Layer(point, {color: 'yellow'}, 'Điểm phân tích'));
  Map.layers().set(2, ui.Map.Layer(buffer, {color: 'yellow', fillColor: '00000000'}, 'Vùng đệm 30x30m'));
  
  // Kiểm tra collection có dữ liệu không
  if (!bimonthlyCollection) {
    showLoading(false);
    showError('Không có dữ liệu chuỗi thời gian. Vui lòng xử lý ảnh trước.');
    return;
  }
  
  try {
    // Mảng chứa kết quả
    var timeSeriesResults = [];
    
    // Lấy tất cả các ảnh đã xử lý từ biến toàn cục
    var processedKeys = Object.keys(processedImagesByPeriod);
    
    // Xác định các chỉ số cần xử lý - cập nhật với các chỉ số mới
    var indices = ['ndvi', 'ndwi', 'ndbi', 'bui', 'ui', 'baei', 'ebbi'];
    
    // Đếm số ảnh cần xử lý để theo dõi tiến độ
    var totalImages = processedKeys.length;
    var processedCount = 0;
    
    // Khi không có ảnh nào để xử lý
    if (totalImages === 0) {
      showLoading(false);
      showError('Không tìm thấy ảnh đã xử lý');
      return;
    }
    
    // Trích xuất giá trị cho từng ảnh theo thứ tự thời gian
    processNextImageValue(0);
    
    // Hàm xử lý từng ảnh theo trình tự
    function processNextImageValue(index) {
      if (index >= processedKeys.length) {
        // Đã xử lý hết tất cả các ảnh
        displayTimeSeriesChart(timeSeriesResults, indices);
        createTimeSeriesDataTable(timeSeriesResults, indices, point);
        
        showLoading(false);
        showSuccess('Đã trích xuất chuỗi thời gian tại tọa độ: ' + 
                   lon.toFixed(6) + ', ' + lat.toFixed(6) + ' (vùng 30x30m)');
        return;
      }
      
      // Lấy ID kỳ hiện tại
      var periodId = processedKeys[index];
      var image = processedImagesByPeriod[periodId];
      
      // Trích xuất thông tin metadata của ảnh
      var isInterpolated = false;
      var imageTime;
      var displayName = periodId;
      
      // Lấy thông tin từ metadata của ảnh
      image.get('interpolated').evaluate(function(interp) {
        isInterpolated = interp;
        
        image.get('system:time_start').evaluate(function(time) {
          imageTime = time;
          
          image.get('display_name').evaluate(function(name) {
            if (name) displayName = name;
            
            // Kiểm tra và tính toán các chỉ số còn thiếu trước khi lấy giá trị
            image.bandNames().evaluate(function(bandNames) {
              var updatedImage = image;
              var needsUpdate = false;
              
              // Tạo hàm để tính toán chỉ số nếu thiếu
              function calculateMissingIndices(img) {
                var finalImg = img;
                
                // Tính BUI nếu chưa có nhưng có NDBI và NDVI
                if (bandNames.indexOf('bui') === -1 && 
                    bandNames.indexOf('ndbi') !== -1 && 
                    bandNames.indexOf('ndvi') !== -1) {
                  var ndbi = img.select('ndbi');
                  var ndvi = img.select('ndvi');
                  var bui = ndbi.subtract(ndvi).rename('bui');
                  finalImg = finalImg.addBands(bui);
                  needsUpdate = true;
                }
                
                // Tính UI nếu chưa có nhưng có B12 và B8
                if (bandNames.indexOf('ui') === -1 && 
                    bandNames.indexOf('B12') !== -1 && 
                    bandNames.indexOf('B8') !== -1) {
                  var ui = img.normalizedDifference(['B12', 'B8']).rename('ui');
                  finalImg = finalImg.addBands(ui);
                  needsUpdate = true;
                }
                
                // BAEI - Nếu thiếu nhưng có các band cần thiết
                if (bandNames.indexOf('baei') === -1 && 
                    bandNames.indexOf('B4') !== -1 && 
                    bandNames.indexOf('B3') !== -1 &&
                    bandNames.indexOf('B8') !== -1 &&
                    bandNames.indexOf('B2') !== -1) {
                  var red_plus_green = img.select('B4').add(img.select('B3'));
                  var nir_plus_blue = img.select('B8').add(img.select('B2'));
                  var baei_numerator = red_plus_green.subtract(nir_plus_blue);
                  var baei_denominator = red_plus_green.add(nir_plus_blue);
                  var baei = baei_numerator.divide(baei_denominator).rename('baei');
                  finalImg = finalImg.addBands(baei);
                  needsUpdate = true;
                }
                
                // EBBI - Nếu thiếu nhưng có các band cần thiết
                if (bandNames.indexOf('ebbi') === -1 && 
                    bandNames.indexOf('B11') !== -1 && 
                    bandNames.indexOf('B8') !== -1 &&
                    bandNames.indexOf('B12') !== -1) {
                  var swir1_minus_nir = img.select('B11').subtract(img.select('B8'));
                  var swir1_plus_swir2 = img.select('B11').add(img.select('B12'));
                  var sqrt_term = swir1_plus_swir2.add(ee.Image.constant(0.0001)).sqrt();
                  var ebbi = swir1_minus_nir.divide(sqrt_term.multiply(10)).rename('ebbi');
                  finalImg = finalImg.addBands(ebbi);
                  needsUpdate = true;
                }
                
                return finalImg;
              }
              
              // Tính toán các chỉ số còn thiếu
              updatedImage = calculateMissingIndices(image);
              
              // Nếu có cập nhật, lưu lại vào biến toàn cục
              if (needsUpdate) {
                processedImagesByPeriod[periodId] = updatedImage;
              }
              
              // Lấy giá trị pixel tại điểm đã chọn
              var meanValues = updatedImage.reduceRegion({
                reducer: ee.Reducer.mean(),
                geometry: buffer,
                scale: 10 // Độ phân giải Sentinel-2
              });
              
              // Lấy giá trị chỉ số
              meanValues.evaluate(function(values) {
                var resultObj = {
                  period_id: periodId,
                  display_name: displayName,
                  time_start: imageTime,
                  interpolated: isInterpolated,
                  values: {}
                };
                
                // Lưu giá trị các chỉ số
                indices.forEach(function(index) {
                  if (values && values[index] !== undefined) {
                    resultObj.values[index] = values[index];
                  }
                });
                
                // Thêm vào mảng kết quả
                timeSeriesResults.push(resultObj);
                
                // Tiếp tục xử lý ảnh tiếp theo
                processedCount++;
                processNextImageValue(index + 1);
              });
            });
          });
        });
      });
    }
  } catch (e) {
    showLoading(false);
    showError('Lỗi khi trích xuất chuỗi thời gian: ' + e.message);
  }
}

// Hàm hiển thị biểu đồ chuỗi thời gian
function displayTimeSeriesChart(timeSeriesResults, indices) {
  // Xóa nội dung cũ
  chartPanel.clear();
  
  // Tiêu đề
  chartPanel.add(ui.Label('Chuỗi thời gian chỉ số phổ', 
    {fontWeight: 'bold', fontSize: '16px', margin: '0 0 10px 0'}));
  
  // Thêm thông tin về vùng đệm
  chartPanel.add(ui.Label('Kích thước vùng phân tích: 30x30m', 
    {fontSize: '13px', margin: '0 0 15px 0'}));
    
  // Sắp xếp dữ liệu theo thời gian
  timeSeriesResults.sort(function(a, b) {
    return a.time_start - b.time_start;
  });
  
  // Tạo dữ liệu cho biểu đồ - bao gồm các chỉ số mới
  var chartData = {
    ndvi: [],
    ndwi: [],
    ndbi: [],
    bui: [],
    ui: [],
    baei: [],
    ebbi: []
  };
  
  var categories = []; // Danh sách kỳ
  
  // Xử lý dữ liệu cho biểu đồ
  timeSeriesResults.forEach(function(result) {
    // Thêm tên kỳ
    var periodId = result.period_id;
    var isInterp = result.interpolated;
    categories.push(periodId + (isInterp ? ' (NỘI SUY)' : ''));
    
    // Thêm dữ liệu mỗi chỉ số
    indices.forEach(function(index) {
      if (result.values[index] !== null && 
          result.values[index] !== undefined) {
        chartData[index].push({
          x: new Date(result.time_start),
          y: result.values[index],
          interpolated: isInterp
        });
      }
    });
  });
  
  // Dropdown để chọn chỉ số hiển thị
  var indexSelectForChart = ui.Select({
    items: [
      {label: 'NDVI - Chỉ số thực vật', value: 'ndvi'},
      {label: 'NDWI - Chỉ số nước', value: 'ndwi'},
      {label: 'NDBI - Chỉ số đô thị', value: 'ndbi'},
      {label: 'BUI - Chỉ số xây dựng kết hợp', value: 'bui'},
      {label: 'UI - Chỉ số đô thị', value: 'ui'},
      {label: 'BAEI - Chỉ số trích xuất khu vực xây dựng', value: 'baei'},
      {label: 'EBBI - Chỉ số xây dựng và đất trống nâng cao', value: 'ebbi'},
      {label: 'Tất cả các chỉ số xây dựng', value: 'all_urban'},
      {label: 'Tất cả các chỉ số', value: 'all'}
    ],
    value: 'ndbi',
    onChange: function(selected) {
      updateChartDisplay(selected);
    },
    style: {width: '95%'}
  });
  
  chartPanel.add(ui.Label('Chọn chỉ số để hiển thị:'));
  chartPanel.add(indexSelectForChart);
  
  // Panel để chứa biểu đồ
  var chartContainer = ui.Panel();
  chartPanel.add(chartContainer);
  
  // Hàm cập nhật hiển thị biểu đồ dựa trên lựa chọn
  function updateChartDisplay(selectedValue) {
    chartContainer.clear();
    
    var indicesToShow = [];
    
    if (selectedValue === 'all') {
      indicesToShow = indices;
    } else if (selectedValue === 'all_urban') {
      indicesToShow = ['ndbi', 'bui', 'ui', 'baei', 'ebbi'];
    } else {
      indicesToShow = [selectedValue];
    }
    
    // Hiển thị các chỉ số được chọn
    indicesToShow.forEach(function(index) {
      if (chartData[index].length > 0) {
        var color = index === 'ndvi' ? 'green' : 
                  (index === 'ndwi' ? 'blue' : 
                  (index === 'ndbi' ? 'brown' : 
                  (index === 'bui' ? 'red' : 
                  (index === 'ui' ? 'purple' : 
                  (index === 'baei' ? 'orange' : 'darkred')))));
                  
        var title = index === 'ndvi' ? 'Chỉ số thực vật (NDVI)' : 
                 (index === 'ndwi' ? 'Chỉ số nước (NDWI)' : 
                 (index === 'ndbi' ? 'Chỉ số đô thị (NDBI)' : 
                 (index === 'bui' ? 'Chỉ số xây dựng kết hợp (BUI)' : 
                 (index === 'ui' ? 'Chỉ số đô thị (UI)' : 
                 (index === 'baei' ? 'Chỉ số trích xuất khu vực xây dựng (BAEI)' : 
                 'Chỉ số xây dựng và đất trống nâng cao (EBBI)')))));
        
        // Chuẩn bị dữ liệu dạng mảng
        var dataValues = chartData[index].map(function(item) { return item.y; });
        
        // Tạo biểu đồ
        var chart = ui.Chart.array.values({
          array: dataValues,
          axis: 0,
          xLabels: categories
        }).setChartType('LineChart')
          .setOptions({
            title: title,
            colors: [color],
            lineWidth: 2,
            pointSize: 4,
            legend: {position: 'none'},
            hAxis: {
              title: 'Thời gian',
              slantedText: true,
              slantedTextAngle: 45
            },
            vAxis: {
              title: 'Giá trị',
              viewWindow: {
                min: -1,
                max: 1
              }
            }
          });
        
        // Thêm biểu đồ vào panel
        chartContainer.add(chart);
      }
    });
    
    // Nếu hiển thị đồng thời nhiều chỉ số, thêm biểu đồ so sánh
    if (indicesToShow.length > 1) {
      createComparisonChart(chartData, categories, indicesToShow);
    }
  }
  
  // Hàm tạo biểu đồ so sánh giữa các chỉ số
  function createComparisonChart(chartData, categories, indicesToShow) {
    // Chuẩn bị dữ liệu cho biểu đồ so sánh
    var allValues = [];
    var colors = [];
    var labels = [];
    
    indicesToShow.forEach(function(index) {
      if (chartData[index].length > 0) {
        var values = chartData[index].map(function(item) { return item.y; });
        allValues.push(values);
        
        var color = index === 'ndvi' ? 'green' : 
                  (index === 'ndwi' ? 'blue' : 
                  (index === 'ndbi' ? 'brown' : 
                  (index === 'bui' ? 'red' : 
                  (index === 'ui' ? 'purple' : 
                  (index === 'baei' ? 'orange' : 'darkred')))));
        colors.push(color);
        
        var label = index.toUpperCase();
        labels.push(label);
      }
    });
    
    // // Nếu có dữ liệu, tạo biểu đồ so sánh
    // if (allValues.length > 0) {
    //   var comparisonChart = ui.Chart.array.values({
    //     array: allValues,
    //     axis: 0,
    //     xLabels: categories
    //   }).setChartType('LineChart')
    //     .setOptions({
    //       title: 'So sánh các chỉ số',
    //       colors: colors,
    //       lineWidth: 2,
    //       pointSize: 3,
    //       hAxis: {
    //         title: 'Thời gian',
    //         slantedText: true,
    //         slantedTextAngle: 45
    //       },
    //       vAxis: {
    //         title: 'Giá trị',
    //         viewWindow: {
    //           min: -1,
    //           max: 1
    //         }
    //       },
    //       legend: {position: 'right'}
    //     });
      
      // Thêm biểu đồ so sánh vào container
      // chartContainer.add(ui.Label('So sánh các chỉ số theo thời gian', 
      //   {fontWeight: 'bold', margin: '10px 0'}));
      // chartContainer.add(comparisonChart);
    // }
  }
  
  // Hiển thị biểu đồ mặc định (NDBI)
  updateChartDisplay('ndbi');
  
  // // Thêm nút để phân tích xu hướng đô thị hóa
  // var analyzeUrbanTrendButton = ui.Button({
  //   label: 'Phân tích xu hướng đô thị hóa',
  //   onClick: function() {
  //     analyzeUrbanTrend(timeSeriesResults);
  //   }
  // });
  // chartPanel.add(analyzeUrbanTrendButton);
  
  // Thêm nút đóng biểu đồ
  var closeButton = ui.Button({
    label: 'Đóng biểu đồ',
    onClick: function() {
      chartPanel.style().set('shown', false);
    },
    style: {margin: '10px 0 0 0'}
  });
  chartPanel.add(closeButton);
}

// Hàm tạo bảng dữ liệu để xuất
function createTimeSeriesDataTable(timeSeriesResults, indices, point) {
  // Tạo một panel riêng cho bảng
  var tablePanel = ui.Panel({
    layout: ui.Panel.Layout.flow('vertical'),
    style: {margin: '15px 0'}
  });
  
  // Thêm tiêu đề cho bảng
  tablePanel.add(ui.Label('Xuất dữ liệu chuỗi thời gian', {fontWeight: 'bold'}));
  
  // Thêm nút xuất CSV
  var exportButton = ui.Button({
    label: 'Xuất dữ liệu (CSV)',
    onClick: function() {
      try {
        // Tạo tên file
        var coords = point.coordinates().getInfo();
        var fileName = 'time_series_' + coords[0].toFixed(4) + '_' + coords[1].toFixed(4);
        
        // Tạo dữ liệu cho CSV
        var csvData = 'period_id,date,interpolated';
        indices.forEach(function(index) {
          csvData += ',' + index;
        });
        csvData += '\n';
        
        // Thêm từng dòng dữ liệu
        timeSeriesResults.forEach(function(result) {
          var date = new Date(result.time_start).toISOString().split('T')[0];
          csvData += result.period_id + ',' + date + ',' + (result.interpolated ? 'YES' : 'NO');
          
          indices.forEach(function(index) {
            csvData += ',' + (result.values[index] !== undefined ? result.values[index] : '');
          });
          
          csvData += '\n';
        });
        
        // Tạo liên kết tải xuống
        var link = document.createElement('a');
        link.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csvData);
        link.target = '_blank';
        link.download = fileName + '.csv';
        link.click();
        
        showSuccess('Đã tạo file CSV thành công');
      } catch (e) {
        showError('Lỗi khi tạo file CSV: ' + e.message);
      }
    }
  });
  
  // Thêm nút vào panel
  tablePanel.add(exportButton);
  
  // Thêm panel vào chart panel
  chartPanel.add(tablePanel);
}

//==========================================================================================//


function applyLandTrendrLikeAlgorithm(timeSeriesData, selectedIndex) {
  // Hàm chuẩn hóa dữ liệu
  function normalizeData(data) {
    const medianFilter = (arr, window) => {
      const result = [];
      for (let i = 0; i < arr.length; i++) {
        const start = Math.max(0, i - Math.floor(window / 2));
        const end = Math.min(arr.length - 1, i + Math.floor(window / 2));
        const median = arr.slice(start, end + 1).sort((a, b) => a - b)[Math.floor((end - start + 1) / 2)];
        result.push(median);
      }
      return result;
    };

    const zScoreThreshold = 2.5;
    const filteredData = medianFilter(data.map(d => d.values[selectedIndex]), 3);
    const zScores = filteredData.map((d, i) => (d - data[i].values[selectedIndex]) / Math.sqrt(data[i].values[selectedIndex]));
    const normalizedData = data.map((d, i) => ({
      ...d,
      values: {
        ...d.values,
        [selectedIndex]: zScores[i] > zScoreThreshold ? filteredData[i] : d.values[selectedIndex]
      }
    }));
    return normalizedData;
  }

  // Hàm xác định các điểm đỉnh tiềm năng
  function findPotentialVertices(data) {
    const max_segments = 8;
    const vertexCountOvershoot = 0.2;
    const segments = [];
    const errors = [];

    for (let i = 0; i < data.length - 1; i++) {
      segments.push([data[i], data[i + 1]]);
      const predicts = data.slice(i, i + 2).map(d => d.values[selectedIndex]);
      const actuals = data.slice(i, i + 2).map(d => d.values[selectedIndex]);
      const mse = actuals.reduce((acc, val, j) => acc + Math.pow(val - predicts[j], 2), 0) / actuals.length;
      errors.push(mse);
    }

    const vertices = [data[0], data[data.length - 1]];
    while (vertices.length < max_segments * (1 + vertexCountOvershoot)) {
      const maxErrorIndex = errors.indexOf(Math.max(...errors));
      vertices.push(data[maxErrorIndex + 1]);
      vertices.sort((a, b) => a.time_start - b.time_start);
      errors.splice(maxErrorIndex, 1);
    }

    return vertices;
  }

  // Hàm lọc các điểm đỉnh dựa trên góc thay đổi
  function filterVerticesByAngle(data, vertices) {
    const angleThreshold = 15; // Độ
    const max_segments = 8;

    while (vertices.length > max_segments) {
      const angles = [];
      for (let i = 1; i < vertices.length - 1; i++) {
        const p1 = vertices[i - 1];
        const p2 = vertices[i];
        const p3 = vertices[i + 1];
        const m1 = (p2.values[selectedIndex] - p1.values[selectedIndex]) / (p2.time_start - p1.time_start);
        const m2 = (p3.values[selectedIndex] - p2.values[selectedIndex]) / (p3.time_start - p2.time_start);
        const angle = Math.atan(Math.abs(m2 - m1) / (1 + m1 * m2)) * 180 / Math.PI;
        angles.push(angle);
      }

      const minAngleIndex = angles.indexOf(Math.min(...angles));
      if (angles[minAngleIndex] < angleThreshold) {
        vertices.splice(minAngleIndex + 1, 1);
      } else {
        break;
      }
    }

    return vertices;
  }

  // Hàm xác định mô hình tốt nhất với số đoạn tối đa
  function findBestModelWithMaxSegments(data, vertices) {
    const pvalThreshold = 0.05;

    const anchoredRegression = (data, vertices) => {
      const segments = [];
      for (let i = 0; i < vertices.length - 1; i++) {
        const start = vertices[i].time_start;
        const end = vertices[i + 1].time_start;
        const segmentData = data.filter(d => d.time_start >= start && d.time_start <= end);
        const x = segmentData.map(d => d.time_start);
        const y = segmentData.map(d => d.values[selectedIndex]);
        const n = x.length;
        const sx = x.reduce((acc, val) => acc + val, 0);
        const sy = y.reduce((acc, val) => acc + val, 0);
        const sxs = x.reduce((acc, val) => acc + val * val, 0);
        const sxy = x.reduce((acc, val, i) => acc + val * y[i], 0);
        const slope = (n * sxy - sx * sy) / (n * sxs - sx * sx);
        const intercept = (sy - slope * sx) / n;
        segments.push({ slope, intercept, start, end });
      }
      return segments;
    };

    const evaluateModel = (data, model) => {
      const predicts = [];
      for (let i = 0; i < data.length; i++) {
        const segment = model.find(s => data[i].time_start >= s.start && data[i].time_start <= s.end);
        const predict = segment.slope * data[i].time_start + segment.intercept;
        predicts.push(predict);
      }
      const residuals = data.map((d, i) => d.values[selectedIndex] - predicts[i]);
      const sse = residuals.reduce((acc, val) => acc + val * val, 0);
      const mse = sse / (data.length - model.length * 2);
      return { mse, sse, residuals };
    };

    const testSegmentSignificance = (data, segment) => {
      const segmentData = data.filter(d => d.time_start >= segment.start && d.time_start <= segment.end);
      const x = segmentData.map(d => d.time_start);
      const y = segmentData.map(d => d.values[selectedIndex]);
      const n = x.length;
      const sx = x.reduce((acc, val) => acc + val, 0);
      const sy = y.reduce((acc, val) => acc + val, 0);
      const sxs = x.reduce((acc, val) => acc + val * val, 0);
      const sxy = x.reduce((acc, val, i) => acc + val * y[i], 0);
      const sse = y.reduce((acc, val, i) => acc + Math.pow(val - (segment.slope * x[i] + segment.intercept), 2), 0);
      const mse = sse / (n - 2);
      const sst = y.reduce((acc, val) => acc + Math.pow(val - sy / n, 2), 0);
      const r2 = 1 - sse / sst;
      const f = (r2 / (1 - r2)) * (n - 2);
      const pval = 1 - jStat.centralF.cdf(f, 1, n - 2);
      return pval;
    };

    let bestModel = anchoredRegression(data, vertices);
    let evaluation = evaluateModel(data, bestModel);

    while (true) {
      let improved = false;
      for (let i = 1; i < bestModel.length; i++) {
        const left = bestModel[i - 1];
        const right = bestModel[i];
        const pval = testSegmentSignificance(data, right);
        if (pval > pvalThreshold) {
          const tempModel = [...bestModel.slice(0, i - 1), { ...left, end: right.end }, ...bestModel.slice(i + 1)];
          const tempEvaluation = evaluateModel(data, tempModel);
          if (tempEvaluation.mse <= evaluation.mse) {
            bestModel = tempModel;
            evaluation = tempEvaluation;
            improved = true;
            break;
          }
        }
      }
      if (!improved) {
        break;
      }
    }

    return { model: bestModel, evaluation };
  }

  // Hàm tạo các mô hình đơn giản hơn dần
  function createSimplifiedModels(data, maxModel) {
    const models = [maxModel];
    let currentModel = maxModel;

    while (currentModel.model.length > 2) {
      const mses = [];
      for (let i = 1; i < currentModel.model.length - 1; i++) {
        const tempModel = {
          model: [...currentModel.model.slice(0, i), ...currentModel.model.slice(i + 1)],
          evaluation: evaluateModel(data, [...currentModel.model.slice(0, i), ...currentModel.model.slice(i + 1)])
        };
        mses.push(tempModel.evaluation.mse);
      }
      const minMseIndex = mses.indexOf(Math.min(...mses));
      currentModel = {
        model: [...currentModel.model.slice(0, minMseIndex + 1), ...currentModel.model.slice(minMseIndex + 2)],
        evaluation: evaluateModel(data, [...currentModel.model.slice(0, minMseIndex + 1), ...currentModel.model.slice(minMseIndex + 2)])
      };
      models.push(currentModel);
    }

    return models;
  }

  // Hàm chọn mô hình tốt nhất
  function selectBestModel(data, models) {
    const n = data.length;
    const bic = models.map(m => n * Math.log(m.evaluation.mse) + m.model.length * Math.log(n));
    const bicMin = Math.min(...bic);
    const bestModelIndex = bic.indexOf(bicMin);
    const bestModel = models[bestModelIndex];

    const f = (models[0].evaluation.sse - bestModel.evaluation.sse) / (bestModel.model.length - models[0].model.length) / (bestModel.evaluation.mse / (n - bestModel.model.length));
    const pval = 1 - jStat.centralF.cdf(f, bestModel.model.length - models[0].model.length, n - bestModel.model.length);

    const logMseImprovement = Math.log10(models[0].evaluation.mse / bestModel.evaluation.mse);
    const logPval = Math.log10(pval);
    const poff = logMseImprovement - logPval;

    const recoverThreshold = Math.min(...models.map(m => m.evaluation.mse)) / 5;
    const recoveredModel = models.find(m => m.evaluation.mse <= recoverThreshold);

    return recoveredModel || bestModel;
  }

  // Áp dụng giải thuật
  const normalizedData = normalizeData(timeSeriesData);
  const potentialVertices = findPotentialVertices(normalizedData);
  const filteredVertices = filterVerticesByAngle(normalizedData, potentialVertices);
  const maxModel = findBestModelWithMaxSegments(normalizedData, filteredVertices);
  const simplifiedModels = createSimplifiedModels(normalizedData, maxModel);
  const bestModel = selectBestModel(normalizedData, simplifiedModels);

  return bestModel;
}

function analyzeLandTrendrLike(timeSeriesResults, selectedIndex) {
  // Gọi hàm applyLandTrendrLikeAlgorithm với dữ liệu chuỗi thời gian và chỉ số đã chọn
  const bestModel = applyLandTrendrLikeAlgorithm(timeSeriesResults, selectedIndex);
  
  // Trực quan hóa kết quả bằng cách vẽ đồ thị với các đoạn thẳng từ mô hình tốt nhất
  visualizeLandTrendrResults(timeSeriesResults, bestModel);
}

function visualizeLandTrendrResults(data, model) {
  const chartData = data.map(d => ({
    x: new Date(d.time_start),
    y: d.values[currentIndex]
  }));
  
  const segmentData = model.model.map(segment => {
    return [{
      x: new Date(segment.start),
      y: segment.intercept
    }, {
      x: new Date(segment.end), 
      y: segment.slope * (segment.end - segment.start) + segment.intercept
    }];
  });
  
  const landTrendrChart = ui.Chart.array.values(chartData, 0, [currentIndex])
    .setChartType('ScatterChart')
    .setOptions({
      title: 'LandTrendr-like Segmentation',
      hAxis: {title: 'Time'},
      vAxis: {title: currentIndex.toUpperCase()},
      trendlines: { 0: { type: 'linear', color: 'purple', opacity: 0.3 } }
    });
    
  segmentData.forEach((segment, i) => {
    landTrendrChart.setValue(i, segment);
  });
  
  chartPanel.widgets().set(1, landTrendrChart);
}




//==========================================================================================//

// Hàm hiển thị thông báo lỗi
function showError(message) {
  infoPanel.clear();
  infoPanel.add(ui.Label(message, {color: 'red'}));
  console.log('ERROR: ' + message);
}

// Hàm hiển thị thông báo thông tin
function showInfo(message) {
  infoPanel.clear();
  infoPanel.add(ui.Label(message, {color: 'blue'}));
  console.log('INFO: ' + message);
}

// Hàm hiển thị thông báo thành công
function showSuccess(message) {
  infoPanel.clear();
  infoPanel.add(ui.Label(message, {color: 'green'}));
  console.log('SUCCESS: ' + message);
}

// Hiển thị hướng dẫn ban đầu
showInfo('Hãy chọn khu vực nghiên cứu và khoảng thời gian để bắt đầu.');

// Thiết lập bản đồ ban đầu
var center = ee.Geometry.Point([105.854444, 21.028511]);
Map.centerObject(center, 13);
Map.setOptions('SATELLITE');