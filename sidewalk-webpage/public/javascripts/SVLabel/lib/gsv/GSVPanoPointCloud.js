var GSVPANO = GSVPANO || {};
GSVPANO.PanoPointCloudLoader = function (parameters) {

    'use strict';

    var _parameters = parameters || {},
        onDepthLoad = null,
        onPointCloudLoad = null;

    this.load = function(panoId) {
        var self = this,
            url;

        //url = "http://maps.google.com/cbk?output=json&cb_client=maps_sv&v=4&dm=1&pm=1&ph=1&hl=en&panoid=" + panoId;
        url = "https://maps.google.com/cbk?output=json&cb_client=maps_sv&v=4&dm=1&pm=1&ph=1&hl=en&panoid=" + panoId;

        $.ajax({
                url: url,
                dataType: 'jsonp'
            })
            .done(function(data, textStatus, xhr) {
                var decoded; //, depthMap;
                var pointCloud;

                try {
                    decoded = self.decode(data.model.depth_map);
                    // depthMap = self.parse(decoded);
                    pointCloud = self.parse(decoded);
                } catch(e) {
                    console.error("Error loading depth map for pano " + panoId + "\n" + e.message + "\nAt " + e.filename + "(" + e.lineNumber + ")");
                    // depthMap = self.createEmptyDepthMap();
                    pointCloud = self.createEmptyPointCloud();
                }
                if(self.onPointCloudLoad) {
                    var x, y, z, r2;
                    var points = [];
                    for (var i = 0; i < pointCloud.pointCloud.length; i += 3) {
                        x = pointCloud.pointCloud[i];
                        y = pointCloud.pointCloud[i + 1];
                        z = pointCloud.pointCloud[i + 2];
                        r2 = x * x + y * y + z * z;
                        if (r2 < 10000) {
                            points.push({x: x, y: y, z: z, id: i});
                        }
                    }

                    self.pointCloud = pointCloud;
                    self.pointCloud.tree = null;
                    // self.pointCloud.tree = new kdTree(points, svl.util.math.distance3d, ['x', 'y', 'z']);

                    self.onPointCloudLoad();
                }
            })
            .fail(function(xhr, textStatus, errorThrown) {
                console.error("Request failed: " + url + "\n" + textStatus + "\n" + errorThrown);
                // var depthMap = self.createEmptyDepthMap();
                var pointCloud = self.createEmptyPointCloud();
                if(self.onPointCloudLoad) {
                    // self.depthMap = depthMap;
                    self.pointCloud = pointCloud;
                    // self.onDepthLoad();
                    self.onPointCloudLoad();
                }
            })
    };

    this.decode = function(rawDepthMap) {
        var self = this,
                   i,
                   compressedDepthMapData,
                   depthMap,
                   decompressedDepthMap;

        // Append '=' in order to make the length of the array a multiple of 4
        while(rawDepthMap.length %4 != 0)
            rawDepthMap += '=';

        // Replace '-' by '+' and '_' by '/'
        rawDepthMap = rawDepthMap.replace(/-/g,'+');
        rawDepthMap = rawDepthMap.replace(/_/g,'/');

        // Decode and decompress data
        compressedDepthMapData = $.base64.decode(rawDepthMap);
        decompressedDepthMap = zpipe.inflate(compressedDepthMapData);

        // Convert output of decompressor to Uint8Array
        depthMap = new Uint8Array(decompressedDepthMap.length);
        for(i=0; i<decompressedDepthMap.length; ++i)
            depthMap[i] = decompressedDepthMap.charCodeAt(i);
        return depthMap;
    };

    this.parseHeader = function(depthMap) {
        return {
            headerSize : depthMap.getUint8(0),
            numberOfPlanes : depthMap.getUint16(1, true),
            width: depthMap.getUint16(3, true),
            height: depthMap.getUint16(5, true),
            offset: depthMap.getUint16(7, true)
        };
    };

    this.parsePlanes = function(header, depthMap) {
        var planes = [],
            indices = [],
            i,
            n = [0, 0, 0],
            d,
            byteOffset;

        for(i=0; i<header.width*header.height; ++i) {
            indices.push(depthMap.getUint8(header.offset + i));
        }

        for(i=0; i<header.numberOfPlanes; ++i) {
            byteOffset = header.offset + header.width*header.height + i*4*4;
            n[0] = depthMap.getFloat32(byteOffset, true);
            n[1] = depthMap.getFloat32(byteOffset + 4, true);
            n[2] = depthMap.getFloat32(byteOffset + 8, true);
            d    = depthMap.getFloat32(byteOffset + 12, true);
            planes.push({
                n: n.slice(0),
                d: d
            });
        }

        return { planes: planes, indices: indices };
    };

    this.computeDepthMap = function(header, indices, planes) {
        var depthMap = null,
            x, y,
            planeIdx,
            phi, theta,
            v = [0, 0, 0],
            w = header.width, h = header.height,
            plane, t, p;

        depthMap = new Float32Array(w*h);

        var sin_theta = new Float32Array(h);
        var cos_theta = new Float32Array(h);
        var sin_phi   = new Float32Array(w);
        var cos_phi   = new Float32Array(w);

        for(y=0; y<h; ++y) {
            theta = (h - y - 0.5) / h * Math.PI;
            sin_theta[y] = Math.sin(theta);
            cos_theta[y] = Math.cos(theta);
        }
        for(x=0; x<w; ++x) {
            phi = (w - x - 0.5) / w * 2 * Math.PI + Math.PI/2;
            sin_phi[x] = Math.sin(phi);
            cos_phi[x] = Math.cos(phi);
        }

        for(y=0; y<h; ++y) {
            for(x=0; x<w; ++x) {
                planeIdx = indices[y*w + x];

                v[0] = sin_theta[y] * cos_phi[x];
                v[1] = sin_theta[y] * sin_phi[x];
                v[2] = cos_theta[y];

                if(planeIdx > 0) {
                    plane = planes[planeIdx];

                    t = Math.abs( plane.d / (v[0]*plane.n[0] + v[1]*plane.n[1] + v[2]*plane.n[2]) );
                    depthMap[y*w + (w-x-1)] = t;
                } else {
                    depthMap[y*w + (w-x-1)] = 9999999999999999999.;
                }
            }
        }

        return {
            width: w,
            height: h,
            depthMap: depthMap
        };
    };

    this.computePointCloud = function(header, indices, planes) {
        var depthMap = null,
            pointCloud = null,
            x, y,
            planeIdx,
            phi, theta,
            //v = [0, 0, 0],
            _v = [0, 0, 0],
            w = header.width, h = header.height,
            plane, // t,
            p, _t;

        //depthMap = new Float32Array(w*h);
        pointCloud = new Float32Array(3 * w * h);

        //var sin_theta = new Float32Array(h);
        //var cos_theta = new Float32Array(h);
        //var sin_phi   = new Float32Array(w);
        //var cos_phi   = new Float32Array(w);
        var _sin_theta = new Float32Array(w);
        var _cos_theta = new Float32Array(w);
        var _sin_phi   = new Float32Array(h);
        var _cos_phi   = new Float32Array(h);

        // KH: A note on spherical coordinates for myself
        // http://mathworld.wolfram.com/SphericalCoordinates.html

        // Mapping between each y pixel coordinate and a polar angle
        for(y=0; y<h; ++y) {
            //theta = (h - y - 0.5) / h * Math.PI;
            //sin_theta[y] = Math.sin(theta);
            //cos_theta[y] = Math.cos(theta);

            phi = (h - y - 0.5) / h * Math.PI;
            _sin_phi[y] = Math.sin(phi);
            _cos_phi[y] = Math.cos(phi);
        }
        // Mapping between each x pixel coordinate and a azimuthal angle
        for(x=0; x<w; ++x) {
            //phi = (w - x - 0.5) / w * 2 * Math.PI + Math.PI/2;
            //sin_phi[x] = Math.sin(phi);
            //cos_phi[x] = Math.cos(phi);

            theta = (w - x - 0.5) / w * 2 * Math.PI + Math.PI/2;
            _sin_theta[x] = Math.sin(theta);
            _cos_theta[x] = Math.cos(theta);
        }

        for(y=0; y<h; ++y) {
            for(x=0; x<w; ++x) {
                planeIdx = indices[y*w + x];

                // A normal vector towards a pixel (x, y)
                //v[0] = sin_theta[y] * cos_phi[x];
                //v[1] = sin_theta[y] * sin_phi[x];
                //v[2] = cos_theta[y];

                _v[0] = _sin_phi[y] * _cos_theta[x];
                _v[1] = _sin_phi[y] * _sin_theta[x];
                _v[2] = _cos_phi[y];

                if(planeIdx > 0) {
                    plane = planes[planeIdx];
                    // Get a depth t. Then compute the xyz coordinate of the
                    // point of intereste from t and v.
                    //t = Math.abs(plane.d / (v[0] * plane.n[0] + v[1] * plane.n[1] + v[2] * plane.n[2]));
                    _t = Math.abs(plane.d / (_v[0] * plane.n[0] + _v[1] * plane.n[1] + _v[2] * plane.n[2]))
                    // depthMap[y*w + (w-x-1)] = t;
                    pointCloud[3 * y * w + 3 * x] = _t * _v[0];
                    pointCloud[3 * y * w + 3 * x + 1] = _t * _v[1];
                    pointCloud[3 * y * w + 3 * x + 2] = _t * _v[2];
                } else {
                    // depthMap[y*w + (w-x-1)] = 9999999999999999999.;
                    pointCloud[3 * y * w + 3 * x] = 9999999999999999999.;
                    pointCloud[3 * y * w + 3 * x + 1] = 9999999999999999999.;
                    pointCloud[3 * y * w + 3 * x + 2] = 9999999999999999999.;
                }
            }
        }

        return {
            width: w,
            height: h,
            pointCloud: pointCloud
        };
    };

    this.parse = function(depthMap) {
        var self = this,
            depthMapData,
            header,
            data,
            depthMap,
            pointCloud;

        depthMapData = new DataView(depthMap.buffer);
        header = self.parseHeader(depthMapData);
        data = self.parsePlanes(header, depthMapData);
        // depthMap = self.computeDepthMap(header, data.indices, data.planes);
        pointCloud = self.computePointCloud(header, data.indices, data.planes);

        // return depthMap;
        return pointCloud;
    };

    this.createEmptyDepthMap = function() {
        var depthMap = {
            width: 512,
            height: 256,
            depthMap: new Float32Array(512*256)
        };
        for(var i=0; i<512*256; ++i)
            depthMap.depthMap[i] = 9999999999999999999.;
        return depthMap;
    };

    this.createEmptyPointCloud = function() {
        var pointCloud = {
            width: 512,
            height: 256,
            pointCloud: new Float32Array(512*256*3)
        };
        for(var i=0; i<512*256*3; ++i)
          pointCloud.pointCloud[i] = 9999999999999999999.;
        return pointCloud;
    };

};
