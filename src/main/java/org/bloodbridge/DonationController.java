package org.bloodbridge;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PastOrPresent;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.sql.Statement;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class DonationController {
    private static final Map<String, List<String>> RED_CELL_COMPATIBILITY = Map.of(
            "O-", List.of("O-"),
            "O+", List.of("O-", "O+"),
            "A-", List.of("O-", "A-"),
            "A+", List.of("O-", "O+", "A-", "A+"),
            "B-", List.of("O-", "B-"),
            "B+", List.of("O-", "O+", "B-", "B+"),
            "AB-", List.of("O-", "A-", "B-", "AB-"),
            "AB+", List.of("O-", "O+", "A-", "A+", "B-", "B+", "AB-", "AB+")
    );

    private final JdbcTemplate jdbc;

    public DonationController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @GetMapping("/dashboard")
    public Map<String, Object> dashboard() {
        return Map.of(
                "donorCount", jdbc.queryForObject("SELECT COUNT(*) FROM donors WHERE is_active = TRUE", Integer.class),
                "unitsAvailable", jdbc.queryForObject("SELECT COALESCE(SUM(units), 0) FROM inventory", Integer.class),
                "openRequests", jdbc.queryForObject("SELECT COUNT(*) FROM blood_requests WHERE status = 'OPEN'", Integer.class),
                "livesSaved", jdbc.queryForObject("SELECT COALESCE(SUM(donations), 0) * 3 FROM donors WHERE is_active = TRUE", Integer.class),
                "inventory", inventory(),
                "requests", requests(),
                "recentDonors", jdbc.query("SELECT id, name, blood_group AS bloodGroup, city, last_donation AS lastDonation, donations FROM donors WHERE is_active = TRUE ORDER BY id DESC LIMIT 5", (rs, row) -> Map.of(
                        "id", rs.getLong("id"), "name", rs.getString("name"), "bloodGroup", rs.getString("bloodGroup"),
                        "city", rs.getString("city"), "lastDonation", rs.getDate("lastDonation") == null ? "" : rs.getDate("lastDonation").toString(),
                        "donations", rs.getInt("donations")
                ))
        );
    }

    @GetMapping("/inventory")
    public List<Map<String, Object>> inventory() {
        return jdbc.query("SELECT blood_group AS bloodGroup, units, threshold_units AS threshold FROM inventory ORDER BY FIELD(blood_group, 'O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+')",
                (rs, row) -> Map.of("bloodGroup", rs.getString("bloodGroup"), "units", rs.getInt("units"), "threshold", rs.getInt("threshold")));
    }

    @GetMapping("/donors")
    public List<Map<String, Object>> donors(@RequestParam(required = false) String bloodGroup,
                                            @RequestParam(required = false) String city,
                                            @RequestParam(required = false) String recipientGroup) {
        List<String> compatible = recipientGroup == null ? List.of() : RED_CELL_COMPATIBILITY.get(recipientGroup);
        if (recipientGroup != null && compatible == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unsupported recipient blood group");
        }
        return jdbc.query("SELECT id, name, blood_group AS bloodGroup, city, phone, last_donation AS lastDonation, donations FROM donors WHERE is_active = TRUE AND (? IS NULL OR blood_group = ?) AND (? IS NULL OR city = ?) ORDER BY name",
                (rs, row) -> {
                    var lastDonation = rs.getDate("lastDonation");
                    boolean eligible = lastDonation == null || !lastDonation.toLocalDate().plusDays(56).isAfter(LocalDate.now());
                    return Map.<String, Object>of("id", rs.getLong("id"), "name", rs.getString("name"), "bloodGroup", rs.getString("bloodGroup"),
                            "city", rs.getString("city"), "phone", rs.getString("phone"),
                            "lastDonation", lastDonation == null ? "" : lastDonation.toString(),
                            "donations", rs.getInt("donations"), "eligible", eligible,
                            "compatible", compatible.isEmpty() || compatible.contains(rs.getString("bloodGroup")));
                }, bloodGroup, bloodGroup, city, city).stream()
                .filter(donor -> bloodGroup == null || bloodGroup.equals(donor.get("bloodGroup")))
                .filter(donor -> compatible.isEmpty() || Boolean.TRUE.equals(donor.get("compatible"))).toList();
    }

    @PostMapping("/donors")
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, Object> createDonor(@Valid @RequestBody DonorForm form) {
        KeyHolder keyHolder = new GeneratedKeyHolder();
        try {
            jdbc.update(connection -> {
                var statement = connection.prepareStatement(
                        "INSERT INTO donors (name, blood_group, city, phone, last_donation) VALUES (?, ?, ?, ?, ?)",
                        Statement.RETURN_GENERATED_KEYS);
                statement.setString(1, form.name().trim());
                statement.setString(2, form.bloodGroup());
                statement.setString(3, form.city().trim());
                statement.setString(4, form.phone().trim());
                statement.setObject(5, form.lastDonation());
                return statement;
            }, keyHolder);
        } catch (DuplicateKeyException exception) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "A donor with this name and phone already exists");
        }
        return Map.of("id", keyHolder.getKey());
    }

    @PutMapping("/donors/{id}")
    public Map<String, Object> updateDonor(@PathVariable long id, @Valid @RequestBody DonorForm form) {
        int updated;
        try {
            updated = jdbc.update(
                    "UPDATE donors SET name = ?, blood_group = ?, city = ?, phone = ?, last_donation = ? WHERE id = ? AND is_active = TRUE",
                    form.name().trim(), form.bloodGroup(), form.city().trim(), form.phone().trim(), form.lastDonation(), id);
        } catch (DuplicateKeyException exception) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "A donor with this name and phone already exists");
        }
        if (updated == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Active donor not found");
        return Map.of("id", id);
    }

    @DeleteMapping("/donors/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deactivateDonor(@PathVariable long id) {
        Integer scheduled = jdbc.queryForObject(
                "SELECT COUNT(*) FROM donation_appointments WHERE donor_id = ? AND status = 'SCHEDULED'",
                Integer.class, id);
        if (scheduled != null && scheduled > 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Cancel scheduled appointments before deactivating this donor");
        }
        int updated = jdbc.update("UPDATE donors SET is_active = FALSE WHERE id = ? AND is_active = TRUE", id);
        if (updated == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Active donor not found");
    }

    @GetMapping("/requests")
    public List<Map<String, Object>> requests() {
        return jdbc.query("SELECT id, patient_name AS patientName, hospital, city, blood_group AS bloodGroup, units, urgency, status, created_at AS createdAt FROM blood_requests ORDER BY created_at DESC",
                (rs, row) -> Map.of("id", rs.getLong("id"), "patientName", rs.getString("patientName"), "hospital", rs.getString("hospital"),
                        "city", rs.getString("city"), "bloodGroup", rs.getString("bloodGroup"), "units", rs.getInt("units"),
                        "urgency", rs.getString("urgency"), "status", rs.getString("status"), "createdAt", rs.getTimestamp("createdAt").toString()));
    }

    @PatchMapping("/requests/{id}/status")
    public Map<String, Object> updateRequestStatus(@PathVariable long id, @Valid @RequestBody RequestStatusForm form) {
        int updated = jdbc.update("UPDATE blood_requests SET status = ? WHERE id = ?", form.status(), id);
        if (updated == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Blood request not found");
        return Map.of("id", id, "status", form.status());
    }

    @PostMapping("/requests")
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, Object> createRequest(@Valid @RequestBody RequestForm form) {
        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbc.update(connection -> {
            var statement = connection.prepareStatement(
                    "INSERT INTO blood_requests (patient_name, hospital, city, blood_group, units, urgency) VALUES (?, ?, ?, ?, ?, ?)",
                    Statement.RETURN_GENERATED_KEYS);
            statement.setString(1, form.patientName());
            statement.setString(2, form.hospital());
            statement.setString(3, form.city());
            statement.setString(4, form.bloodGroup());
            statement.setInt(5, form.units());
            statement.setString(6, form.urgency());
            return statement;
        }, keyHolder);
        long eligibleMatches = donors(null, form.city(), form.bloodGroup()).stream()
                .filter(donor -> Boolean.TRUE.equals(donor.get("eligible"))).count();
        return Map.of("id", keyHolder.getKey(), "eligibleMatches", eligibleMatches);
    }

    @GetMapping("/inventory/adjustments")
    public List<Map<String, Object>> inventoryAdjustments() {
        return jdbc.query("SELECT id, blood_group AS bloodGroup, units_delta AS unitsDelta, reason, created_at AS createdAt FROM inventory_adjustments ORDER BY created_at DESC, id DESC LIMIT 50",
                (rs, row) -> Map.of("id", rs.getLong("id"), "bloodGroup", rs.getString("bloodGroup"),
                        "unitsDelta", rs.getInt("unitsDelta"), "reason", rs.getString("reason"),
                        "createdAt", rs.getTimestamp("createdAt").toString()));
    }

    @PostMapping("/inventory/adjustments")
    @Transactional
    public Map<String, Object> adjustInventory(@Valid @RequestBody InventoryAdjustmentForm form) {
        if (form.unitsDelta() == 0) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Adjustment must be non-zero");
        Integer currentUnits = jdbc.queryForObject(
                "SELECT units FROM inventory WHERE blood_group = ? FOR UPDATE", Integer.class, form.bloodGroup());
        if (currentUnits == null) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Inventory blood group not found");
        long updatedStock = currentUnits.longValue() + form.unitsDelta();
        if (updatedStock < 0) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Adjustment cannot reduce stock below zero");
        if (updatedStock > Integer.MAX_VALUE) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Adjustment exceeds the supported inventory limit");
        int updatedUnits = (int) updatedStock;
        jdbc.update("UPDATE inventory SET units = ? WHERE blood_group = ?", updatedUnits, form.bloodGroup());
        jdbc.update("INSERT INTO inventory_adjustments (blood_group, units_delta, reason) VALUES (?, ?, ?)",
                form.bloodGroup(), form.unitsDelta(), form.reason().trim());
        return Map.of("bloodGroup", form.bloodGroup(), "units", updatedUnits);
    }

    @GetMapping("/appointments")
    public List<Map<String, Object>> appointments() {
        return jdbc.query("SELECT a.id, a.donor_id AS donorId, d.name AS donorName, d.blood_group AS bloodGroup, "
                        + "a.request_id AS requestId, r.patient_name AS patientName, a.scheduled_at AS scheduledAt, "
                        + "a.location, a.status FROM donation_appointments a "
                        + "JOIN donors d ON d.id = a.donor_id "
                        + "LEFT JOIN blood_requests r ON r.id = a.request_id "
                        + "ORDER BY a.scheduled_at DESC",
                (rs, row) -> {
                    long requestId = rs.getLong("requestId");
                    String patientName = rs.getString("patientName");
                    return Map.of("id", rs.getLong("id"), "donorId", rs.getLong("donorId"),
                            "donorName", rs.getString("donorName"), "bloodGroup", rs.getString("bloodGroup"),
                            "requestId", requestId == 0 ? 0L : requestId,
                            "patientName", patientName == null ? "" : patientName,
                            "scheduledAt", rs.getTimestamp("scheduledAt").toLocalDateTime().toString(),
                            "location", rs.getString("location"), "status", rs.getString("status"));
                });
    }

    @PostMapping("/appointments")
    @ResponseStatus(HttpStatus.CREATED)
    @Transactional
    public Map<String, Object> createAppointment(@Valid @RequestBody AppointmentForm form) {
        Map<String, Object> donor = jdbc.query(
                "SELECT id, name, blood_group AS bloodGroup, city, last_donation AS lastDonation FROM donors WHERE id = ? AND is_active = TRUE FOR UPDATE",
                (rs, row) -> {
                    var lastDonation = rs.getDate("lastDonation");
                    return Map.<String, Object>of("id", rs.getLong("id"), "name", rs.getString("name"),
                            "bloodGroup", rs.getString("bloodGroup"), "city", rs.getString("city"),
                            "lastDonation", lastDonation == null ? "" : lastDonation.toLocalDate().toString(),
                            "eligible", lastDonation == null || !lastDonation.toLocalDate().plusDays(56).isAfter(LocalDate.now()));
                }, form.donorId()).stream().findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Active donor not found"));
        if (!Boolean.TRUE.equals(donor.get("eligible"))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Donor is still within the 56-day donation interval");
        }
        if (form.requestId() != null) {
            Map<String, Object> request = jdbc.query(
                    "SELECT city, blood_group AS bloodGroup, status FROM blood_requests WHERE id = ?",
                    (rs, row) -> Map.<String, Object>of("city", rs.getString("city"),
                            "bloodGroup", rs.getString("bloodGroup"), "status", rs.getString("status")),
                    form.requestId()).stream().findFirst()
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Blood request not found"));
            List<String> compatible = RED_CELL_COMPATIBILITY.get(request.get("bloodGroup"));
            if (!"OPEN".equals(request.get("status")) && !"MATCHED".equals(request.get("status"))) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Appointments can only be linked to open or matched requests");
            }
            if (!compatible.contains(donor.get("bloodGroup"))) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Donor blood group is not compatible with this request");
            }
            if (!String.valueOf(request.get("city")).equalsIgnoreCase(String.valueOf(donor.get("city")))) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Donor and request must be in the same city");
            }
        }
        Integer conflicts = jdbc.queryForObject(
                "SELECT COUNT(*) FROM donation_appointments WHERE donor_id = ? AND status = 'SCHEDULED' AND scheduled_at = ?",
                Integer.class, form.donorId(), form.scheduledAt());
        if (conflicts != null && conflicts > 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Donor already has an appointment at this time");
        }
        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbc.update(connection -> {
            var statement = connection.prepareStatement(
                    "INSERT INTO donation_appointments (donor_id, request_id, scheduled_at, location) VALUES (?, ?, ?, ?)",
                    Statement.RETURN_GENERATED_KEYS);
            statement.setLong(1, form.donorId());
            if (form.requestId() == null) statement.setNull(2, java.sql.Types.BIGINT);
            else statement.setLong(2, form.requestId());
            statement.setObject(3, form.scheduledAt());
            statement.setString(4, form.location().trim());
            return statement;
        }, keyHolder);
        return Map.of("id", keyHolder.getKey());
    }

    @PatchMapping("/appointments/{id}/status")
    @Transactional
    public Map<String, Object> updateAppointmentStatus(@PathVariable long id, @Valid @RequestBody AppointmentStatusForm form) {
        Map<String, Object> appointment = jdbc.query(
                "SELECT donor_id AS donorId, request_id AS requestId, scheduled_at AS scheduledAt, status "
                        + "FROM donation_appointments WHERE id = ? FOR UPDATE",
                (rs, row) -> {
                    long requestId = rs.getLong("requestId");
                    return Map.<String, Object>of("donorId", rs.getLong("donorId"),
                            "requestId", rs.wasNull() ? 0L : requestId,
                            "scheduledAt", rs.getTimestamp("scheduledAt").toLocalDateTime().toString(),
                            "status", rs.getString("status"));
                }, id).stream().findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Appointment not found"));
        if (!"SCHEDULED".equals(appointment.get("status"))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Only scheduled appointments can be updated");
        }
        if ("COMPLETED".equals(form.status())) {
            if (LocalDateTime.parse((String) appointment.get("scheduledAt")).isAfter(LocalDateTime.now())) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A future appointment cannot be completed");
            }
            long donorId = (long) appointment.get("donorId");
            String bloodGroup = jdbc.queryForObject("SELECT blood_group FROM donors WHERE id = ?", String.class, donorId);
            jdbc.update("UPDATE donors SET last_donation = CURDATE(), donations = donations + 1 WHERE id = ?", donorId);
            jdbc.update("UPDATE inventory SET units = units + 1 WHERE blood_group = ?", bloodGroup);
            jdbc.update("INSERT INTO inventory_adjustments (blood_group, units_delta, reason) VALUES (?, 1, ?)",
                    bloodGroup, "Completed donation appointment #" + id);
            long requestId = (long) appointment.get("requestId");
            if (requestId > 0) jdbc.update("UPDATE blood_requests SET status = 'MATCHED' WHERE id = ? AND status = 'OPEN'", requestId);
        }
        jdbc.update("UPDATE donation_appointments SET status = ? WHERE id = ?", form.status(), id);
        return Map.of("id", id, "status", form.status());
    }

    public record RequestForm(
            @NotBlank String patientName,
            @NotBlank String hospital,
            @NotBlank String city,
            @Pattern(regexp = "O-|O\\+|A-|A\\+|B-|B\\+|AB-|AB\\+") String bloodGroup,
            @Min(1) int units,
            @Pattern(regexp = "STANDARD|URGENT|CRITICAL") String urgency
    ) {}

    public record DonorForm(
            @NotBlank @Size(max = 120) String name,
            @NotBlank @Pattern(regexp = "O-|O\\+|A-|A\\+|B-|B\\+|AB-|AB\\+") String bloodGroup,
            @NotBlank @Size(max = 100) String city,
            @NotBlank @Size(max = 30) String phone,
            @PastOrPresent LocalDate lastDonation
    ) {}

    public record RequestStatusForm(
            @NotBlank @Pattern(regexp = "OPEN|MATCHED|CLOSED") String status
    ) {}

    public record InventoryAdjustmentForm(
            @NotBlank @Pattern(regexp = "O-|O\\+|A-|A\\+|B-|B\\+|AB-|AB\\+") String bloodGroup,
            @NotNull Integer unitsDelta,
            @NotBlank @Size(max = 240) String reason
    ) {}

    public record AppointmentForm(
            @Min(1) long donorId,
            @Min(1) Long requestId,
            @NotNull @jakarta.validation.constraints.Future LocalDateTime scheduledAt,
            @NotBlank @Size(max = 160) String location
    ) {}

    public record AppointmentStatusForm(
            @NotBlank @Pattern(regexp = "COMPLETED|CANCELLED") String status
    ) {}
}